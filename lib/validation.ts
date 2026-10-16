import { z } from 'zod';
export const stages = ['NEW LEAD','RESEARCHED','QUALIFIED','CONTACTED','MEETING BOOKED','DISCOVERY COMPLETED','PROPOSAL SENT','NEGOTIATION','WON','LOST'] as const;
export const companySchema = z.object({name:z.string().trim().min(2).max(200),website:z.union([z.url().max(2048),z.literal('')]).optional(),industry:z.string().max(100).default('Unclassified'),city:z.string().max(100).default(''),country:z.string().max(100).default('Zimbabwe'),email:z.union([z.email(),z.literal('')]).optional(),phone:z.string().max(50).optional(),notes:z.string().max(10000).default(''),source:z.string().max(100).default('Manual'),stage:z.enum(stages).default('NEW LEAD'),dealValue:z.coerce.number().min(0).max(1000000000).default(0)});
export function normalizeWebsite(raw?:string) {
 if(!raw) return {website:null,domain:null};
 const url = new URL(raw);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port)) throw new Error('Only public HTTP(S) websites on standard ports are supported');
 url.hash='';
 return {website:url.href,domain:url.hostname.toLowerCase().replace(/^www\./,'')};
}
