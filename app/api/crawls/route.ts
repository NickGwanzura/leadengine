import { db } from '@/lib/db';
import { redis,connectRedis } from '@/lib/redis';
import { apiError,requireMember,sameOrigin,ApiError } from '@/lib/access';
import { validatePublicUrl } from '@/lib/url-security';
import { z } from 'zod';
export async function POST(request:Request){try{sameOrigin(request);const m=await requireMember(true);const {companyId,authorized}=z.object({companyId:z.string(),authorized:z.literal(true)}).parse(await request.json());if(!authorized)throw new ApiError(400,'Crawl authorization required');const company=await db.prospectCompany.findFirst({where:{id:companyId,organizationId:m.organizationId}});if(!company?.website)throw new ApiError(400,'Company needs a website');try{await validatePublicUrl(company.website);}catch{throw new ApiError(400,'Website must resolve exclusively to public HTTP(S) addresses');}
 const job=await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${m.organizationId}))`;const existing=await tx.crawlJob.findFirst({where:{companyId,status:{in:['QUEUED','RUNNING']}}});if(existing)return existing;const queued=await tx.crawlJob.count({where:{company:{organizationId:m.organizationId},status:{in:['QUEUED','RUNNING']}}});if(queued>=100)throw new ApiError(429,'Organization queue limit reached');const j=await tx.crawlJob.create({data:{companyId,url:company.website!,approvedDomain:new URL(company.website!).hostname,approvedBy:m.userId}});await tx.auditLog.create({data:{organizationId:m.organizationId,userId:m.userId,action:'CRAWL_AUTHORIZED',entityId:j.id,detail:{url:j.url}}});return j;});
 // PostgreSQL is the durable outbox; Redis is the wake-up queue. Worker polls to recover lost wake-ups.
 try{await connectRedis();await redis.lpush('crawl:wakeup',job.id);await redis.ltrim('crawl:wakeup',0,999);}catch{/* Durable queued row is picked up on the next worker poll. */}
 return Response.json(job,{status:202});}catch(e){return apiError(e);}}
