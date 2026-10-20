import { z } from 'zod';
export const stages = ['NEW LEAD','RESEARCHED','QUALIFIED','CONTACTED','MEETING BOOKED','DISCOVERY COMPLETED','PROPOSAL SENT','NEGOTIATION','WON','LOST'] as const;
// Spreadsheets and people often write "acme.co.zw"; treat a scheme-less value as https before URL validation.
export function withScheme(raw:string){const value=raw.trim();return value&&!/^[a-z][a-z0-9+.-]*:/i.test(value)?`https://${value}`:value;}
export const websiteField=z.preprocess(value=>typeof value==='string'?withScheme(value):value,z.union([z.url().max(2048),z.literal('')]).optional());
export const companySchema = z.object({name:z.string().trim().min(2).max(200),website:websiteField,industry:z.string().max(100).default('Unclassified'),city:z.string().max(100).default(''),country:z.string().max(100).default('Zimbabwe'),email:z.union([z.email(),z.literal('')]).optional(),phone:z.string().max(50).optional(),notes:z.string().max(10000).default(''),source:z.string().max(100).default('Manual'),stage:z.enum(stages).default('NEW LEAD'),dealValue:z.coerce.number().min(0).max(1000000000).default(0)});
export function normalizeWebsite(raw?:string) {
 if(!raw) return {website:null,domain:null};
 const url = new URL(raw);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port)) throw new Error('Only public HTTP(S) websites on standard ports are supported');
 url.hash='';
 return {website:url.href,domain:url.hostname.toLowerCase().replace(/^www\./,'')};
}
// Point at the spreadsheet row (header is row 1) and field so one bad cell is easy to fix.
export function importIssue(issue?:z.core.$ZodIssue){if(!issue)return 'Invalid import; check all required fields';const [,row,field]=issue.path;return typeof row==='number'&&field?`Row ${row+2}, ${String(field)}: ${issue.message}`:`Invalid import: ${issue.message}`;}
