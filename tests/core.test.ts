import { describe,it,expect } from 'vitest';
import { z } from 'zod';
import { scoreLead,scoreProspect,limits } from '../lib/scoring';
import { recommendOpportunities } from '../lib/opportunities';
import { publicAiStatus, generateChatText } from '../lib/ai-provider';
import { companySchema,importIssue,normalizeWebsite } from '../lib/validation';
import { isPublicAddress } from '../lib/url-security';
describe('Lead scoring',()=>{
 it('never infers commercial signals',()=>expect(scoreLead({}).total).toBe(0));
 it('caps and floors each component',()=>expect(scoreLead({fit:100,opportunity:-3}).total).toBe(25));
 it('classifies high priority',()=>expect(scoreLead(limits).category).toBe('High priority'));
 it('uses recorded CRM and latest-audit evidence without inventing deal value',()=>{
  const score=scoreProspect({industry:'Education',stage:'NEW LEAD',dealValue:'0',email:null,phone:null,contactPerson:null,contactPosition:null,activities:[],audits:[{createdAt:new Date(),findings:[{classification:'POTENTIAL ISSUE',category:'Search metadata'}]}]});
  expect(score.breakdown.fit).toBe(16);
  expect(score.breakdown.opportunity).toBe(5);
  expect(score.breakdown.commercial).toBe(0);
  expect(score.explanation).toContain('No deal value was entered');
 });
 it('counts a scheduled CRM task as a recorded engagement signal',()=>{
  const score=scoreProspect({industry:'Unclassified',stage:'NEW LEAD',dealValue:'0',followUpTasks:[{dueAt:new Date('2026-10-20T12:00:00Z')} ]},new Date('2026-10-16T12:00:00Z'));
  expect(score.breakdown.engagement).toBe(1);
  expect(score.explanation).toContain('upcoming follow-up task');
 });
 it('does not turn verified observations into sales recommendations',()=>{
  const suggestions=recommendOpportunities({id:'c1',name:'Example',industry:'Other',website:'https://example.com',audits:[{createdAt:new Date(),findings:[{classification:'VERIFIED',category:'Public forms',observation:'A form is present',sourceUrl:'https://example.com'}]}]},[]);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].product).toBe('No recommendation yet');
 });
});
describe('AI provider boundary',()=>{
 it('reports configuration without returning a credential',()=>{
  const before={provider:process.env.AI_PROVIDER,key:process.env.AI_API_KEY,base:process.env.AI_BASE_URL,model:process.env.AI_MODEL};
  process.env.AI_PROVIDER='openai-compatible';process.env.AI_API_KEY='test-secret';process.env.AI_BASE_URL='https://api.example.test/v1';process.env.AI_MODEL='test-model';
  const status=publicAiStatus();
  expect(status).toMatchObject({configured:true,provider:'openai-compatible',model:'test-model'});
  expect(JSON.stringify(status)).not.toContain('test-secret');
  if(before.provider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=before.provider;
  if(before.key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=before.key;
  if(before.base===undefined)delete process.env.AI_BASE_URL;else process.env.AI_BASE_URL=before.base;
  if(before.model===undefined)delete process.env.AI_MODEL;else process.env.AI_MODEL=before.model;
 });
 it('posts server-side auth to the configured endpoint and extracts only text',async()=>{
  const before={provider:process.env.AI_PROVIDER,key:process.env.AI_API_KEY,base:process.env.AI_BASE_URL,model:process.env.AI_MODEL};
  process.env.AI_PROVIDER='openai-compatible';process.env.AI_API_KEY='test-secret';process.env.AI_BASE_URL='https://api.example.test/v1';process.env.AI_MODEL='test-model';
  let capturedUrl='';let capturedAuthorization='';let capturedBody:Record<string,unknown>={};
  const fakeFetch:typeof fetch=async(input,init)=>{capturedUrl=String(input);capturedAuthorization=new Headers(init?.headers).get('authorization')||'';capturedBody=JSON.parse(String(init?.body));return Response.json({choices:[{message:{content:'draft text'}}]});};
  const result=await generateChatText([{role:'user',content:'test'}],fakeFetch);
  expect(capturedUrl).toBe('https://api.example.test/v1/chat/completions');
  expect(capturedAuthorization).toBe('Bearer test-secret');
  expect(capturedBody.response_format).toEqual({type:'json_object'});
  expect(capturedBody.store).toBe(false);
  expect(result.content).toBe('draft text');
  if(before.provider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=before.provider;
  if(before.key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=before.key;
  if(before.base===undefined)delete process.env.AI_BASE_URL;else process.env.AI_BASE_URL=before.base;
  if(before.model===undefined)delete process.env.AI_MODEL;else process.env.AI_MODEL=before.model;
 });
});
describe('CRM validation',()=>{it('rejects missing names',()=>expect(companySchema.safeParse({name:''}).success).toBe(false));it('preserves notes and normalizes domains',()=>{expect(normalizeWebsite('https://WWW.Example.com/a#b')).toEqual({website:'https://www.example.com/a',domain:'example.com'});});it('rejects credentials and non-http URLs',()=>{expect(()=>normalizeWebsite('http://user:pass@example.com')).toThrow();expect(()=>normalizeWebsite('file:///etc/passwd')).toThrow();});});
describe('Address policy',()=>{it.each(['127.0.0.1','10.0.0.2','169.254.169.254','172.16.2.2','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1','2002:7f00:1::'])('blocks %s',ip=>expect(isPublicAddress(ip)).toBe(false));it.each(['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])('allows public %s',ip=>expect(isPublicAddress(ip)).toBe(true));});
describe('Company website input',()=>{
 it('accepts a bare domain as https',()=>{const parsed=companySchema.parse({name:'Acme',website:' acme.co.zw '});expect(parsed.website).toBe('https://acme.co.zw');expect(normalizeWebsite(parsed.website).domain).toBe('acme.co.zw');});
 it('keeps blank and explicit-scheme websites unchanged',()=>{expect(companySchema.parse({name:'Acme',website:''}).website).toBe('');expect(companySchema.parse({name:'Acme',website:'http://acme.com'}).website).toBe('http://acme.com');});
 it('still rejects a value that is not a URL',()=>expect(companySchema.safeParse({name:'Acme',website:'not a site'}).success).toBe(false));
 it('names the spreadsheet row and field of an import error',()=>{const result=z.object({rows:z.array(companySchema)}).safeParse({rows:[{name:'Good'},{name:'Bad',email:'nope'}]});expect(result.success).toBe(false);expect(importIssue(result.error?.issues[0])).toMatch(/^Row 3, email: /);});
});
