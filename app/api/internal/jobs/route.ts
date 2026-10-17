import { timingSafeEqual,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError,apiError } from '@/lib/access';
import { publicContactCandidates } from '@/lib/contact-enrichment';
import { scoreProspect } from '@/lib/scoring';
const classification=z.enum(['VERIFIED','POTENTIAL ISSUE','NOT OBSERVABLE','REQUIRES MANUAL REVIEW']);
const resultSchema=z.object({pages:z.array(z.object({url:z.url(),title:z.string().max(1000).nullable(),statusCode:z.number().int(),metadata:z.record(z.string(),z.json())})).max(5),findings:z.array(z.object({category:z.string().max(100),classification,observation:z.string().max(5000),recommendation:z.string().max(5000),sourceUrl:z.url(),evidence:z.record(z.string(),z.json()),confidence:z.number().min(0).max(1)})).max(100),summary:z.string().max(10000)});
function authorize(request:Request){const secret=process.env.INTERNAL_API_SECRET||'';const got=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(secret.length<32||got.length!==secret.length||!timingSafeEqual(Buffer.from(secret),Buffer.from(got)))throw new ApiError(401,'Unauthorized worker');}
export async function POST(request:Request){try{authorize(request);const input=z.object({action:z.enum(['claim','progress','complete','fail']),id:z.string().optional(),leaseToken:z.string().optional(),progress:z.number().int().min(0).max(99).optional(),error:z.string().max(500).optional(),retryable:z.boolean().optional(),result:resultSchema.optional()}).parse(await request.json());
 if(input.action==='claim'){
 const job=await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(711042)`;await tx.crawlJob.updateMany({where:{status:'RUNNING',leaseExpiresAt:{lt:new Date()},attempt:{gte:3}},data:{status:'FAILED',error:'WORKER_LEASE_EXPIRED',finishedAt:new Date(),leaseToken:null}});const j=await tx.crawlJob.findFirst({where:{OR:[{status:'QUEUED',availableAt:{lte:new Date()}},{status:'RUNNING',leaseExpiresAt:{lt:new Date()},attempt:{lt:3}}]},orderBy:{createdAt:'asc'}});if(!j)return null;return tx.crawlJob.update({where:{id:j.id},data:{status:'RUNNING',attempt:{increment:1},startedAt:new Date(),leaseToken:randomUUID(),leaseExpiresAt:new Date(Date.now()+180000),progress:5,error:null}});});return Response.json({job});}
 const job=await db.crawlJob.findFirst({where:{id:input.id||'',leaseToken:input.leaseToken||'',status:'RUNNING',leaseExpiresAt:{gt:new Date()}}});if(!job)throw new ApiError(409,'Job cancelled or lease no longer valid');
 await db.$transaction(async tx=>{const locked=await tx.crawlJob.updateMany({where:{id:job.id,status:'RUNNING',leaseToken:input.leaseToken,leaseExpiresAt:{gt:new Date()}},data:{leaseExpiresAt:new Date(Date.now()+180000)}});if(!locked.count)throw new ApiError(409,'Lease no longer valid');
 if(input.action==='progress'){await tx.crawlJob.update({where:{id:job.id},data:{progress:input.progress??10}});return;}
 if(input.action==='fail'){const retry=input.retryable!==false&&job.attempt<job.maxAttempts;await tx.crawlJob.update({where:{id:job.id},data:{status:retry?'QUEUED':'FAILED',error:input.error||'CRAWL_FAILED',availableAt:new Date(Date.now()+Math.pow(2,job.attempt)*15000),finishedAt:retry?null:new Date(),leaseToken:null,leaseExpiresAt:null}});return;}
 if(!input.result||!input.result.pages.length)throw new ApiError(400,'Crawl result and pages required');
 for(const url of [...input.result.pages.map(p=>p.url),...input.result.findings.map(f=>f.sourceUrl)])if(new URL(url).hostname!==job.approvedDomain)throw new ApiError(400,'Evidence must belong to the approved domain');
 const contacts=publicContactCandidates(input.result.findings,job.approvedDomain);
 await tx.websiteAudit.create({data:{companyId:job.companyId,jobId:job.id,summary:input.result.summary,pages:{create:input.result.pages},findings:{create:input.result.findings}}});
 if(contacts.email)await tx.prospectCompany.updateMany({where:{id:job.companyId,email:null},data:{email:contacts.email.value}});
 if(contacts.phone)await tx.prospectCompany.updateMany({where:{id:job.companyId,phone:null},data:{phone:contacts.phone.value}});
 const company=await tx.prospectCompany.findUniqueOrThrow({where:{id:job.companyId},include:{activities:{orderBy:{createdAt:'desc'},take:20},followUpTasks:{where:{status:'OPEN'},orderBy:{dueAt:'asc'},take:20,select:{dueAt:true}},audits:{orderBy:{createdAt:'desc'},take:1,include:{findings:true}}}});
 const score=scoreProspect(company);
 await tx.leadScore.upsert({where:{companyId:job.companyId},create:{companyId:job.companyId,total:score.total,breakdown:score.breakdown,explanation:score.explanation},update:{total:score.total,breakdown:score.breakdown,explanation:score.explanation}});
 await tx.crawlJob.update({where:{id:job.id},data:{status:'COMPLETED',progress:100,finishedAt:new Date(),leaseToken:null,leaseExpiresAt:null}});
 await tx.dealActivity.create({data:{companyId:job.companyId,userId:job.approvedBy,type:'AUDIT_COMPLETED',body:`Website audit completed with ${input.result.pages.length} evidence pages.`}});
 await tx.auditLog.create({data:{organizationId:company.organizationId,userId:job.approvedBy,action:'AUDIT_ENRICHED_AND_SCORED',entityId:job.companyId,detail:{jobId:job.id,auditSource:input.result.pages[0].url,contactSourceUrls:[contacts.email?.sourceUrl,contacts.phone?.sourceUrl].filter(Boolean),score:score.total}}});
 });return Response.json({ok:true});}catch(e){return apiError(e);}}
