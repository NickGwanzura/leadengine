import { describe,it,expect } from 'vitest';
import { scoreLead,limits } from '../lib/scoring';
import { companySchema,normalizeWebsite } from '../lib/validation';
import { isPublicAddress } from '../lib/url-security';
describe('Lead scoring',()=>{it('never infers commercial signals',()=>expect(scoreLead({}).total).toBe(0));it('caps and floors each component',()=>expect(scoreLead({fit:100,opportunity:-3}).total).toBe(25));it('classifies high priority',()=>expect(scoreLead(limits).category).toBe('High priority'));});
describe('CRM validation',()=>{it('rejects missing names',()=>expect(companySchema.safeParse({name:''}).success).toBe(false));it('preserves notes and normalizes domains',()=>{expect(normalizeWebsite('https://WWW.Example.com/a#b')).toEqual({website:'https://www.example.com/a',domain:'example.com'});});it('rejects credentials and non-http URLs',()=>{expect(()=>normalizeWebsite('http://user:pass@example.com')).toThrow();expect(()=>normalizeWebsite('file:///etc/passwd')).toThrow();});});
describe('Address policy',()=>{it.each(['127.0.0.1','10.0.0.2','169.254.169.254','172.16.2.2','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1','2002:7f00:1::'])('blocks %s',ip=>expect(isPublicAddress(ip)).toBe(false));it.each(['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])('allows public %s',ip=>expect(isPublicAddress(ip)).toBe(true));});
