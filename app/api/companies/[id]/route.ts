import { db } from '@/lib/db';
import { z } from 'zod';
import { normalizeWebsite, stages } from '@/lib/validation';
import { apiError,requireMember,sameOrigin,ApiError } from '@/lib/access';
import { recalculateCompanyScore } from '@/lib/score-service';
import { scoreProspect } from '@/lib/scoring';
const update=z.object({
 name:z.string().trim().min(2).max(200).optional(),
 website:z.union([z.url().max(2048),z.literal('')]).optional(),
 industry:z.string().trim().max(100).optional(),
 city:z.string().trim().max(100).optional(),
 country:z.string().trim().max(100).optional(),
 email:z.union([z.email(),z.literal('')]).optional(),
 phone:z.string().trim().max(50).optional(),
 dealValue:z.number().min(0).max(1000000000).optional(),
 stage:z.enum(stages).optional(),
 notes:z.string().max(10000).optional(),
 nextFollowUp:z.iso.datetime().nullable().optional(),
 activity:z.string().trim().min(1).max(5000).optional(),
});

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const member=await requireMember();
  const {id}=await params;
  const company=await db.prospectCompany.findFirst({
   where:{id,organizationId:member.organizationId},
   include:{score:true,_count:{select:{audits:true}},jobs:{orderBy:{createdAt:'desc'},take:1},audits:{orderBy:{createdAt:'desc'},take:1,include:{findings:true,pages:true}},activities:{orderBy:{createdAt:'desc'},take:20},followUpTasks:{where:{status:'OPEN'},orderBy:{dueAt:'asc'},take:20,select:{dueAt:true}}},
  });
  if(!company)throw new ApiError(404,'Company not found');
  return Response.json({...company,score:company.score??{...scoreProspect(company),override:null,updatedAt:company.updatedAt}});
 }catch(error){return apiError(error);}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  sameOrigin(request);
  const member=await requireMember(true);
  const {id}=await params;
  const result=update.safeParse(await request.json());
  if(!result.success)throw new ApiError(400,result.error.issues[0].message);
  const company=await db.prospectCompany.findFirst({where:{id,organizationId:member.organizationId}});
  if(!company)throw new ApiError(404,'Company not found');
  const {activity,website,...fields}=result.data;
  let websiteFields:Partial<{website:string|null;domain:string|null}>={};
  if(website!==undefined){try{websiteFields=normalizeWebsite(website);}catch{throw new ApiError(400,'Invalid public website URL');}}
  if(website!==undefined&&websiteFields.website!==undefined&&websiteFields.website!==company.website){
   const active=await db.crawlJob.count({where:{companyId:id,status:{in:['QUEUED','RUNNING']}}});
   if(active)throw new ApiError(409,'Wait for or cancel the active website audit before changing the URL');
  }
  await db.$transaction(async tx=>{
   await tx.prospectCompany.update({where:{id},data:{...fields,...websiteFields,email:fields.email===''?null:fields.email}});
   if(activity||fields.stage)await tx.dealActivity.create({data:{companyId:id,userId:member.userId,type:activity?'NOTE':'STAGE_CHANGED',body:activity||`${company.stage} → ${fields.stage}`}});
   await recalculateCompanyScore(tx,id);
   await tx.auditLog.create({data:{organizationId:member.organizationId,userId:member.userId,action:'COMPANY_UPDATED',entityId:id,detail:{fields:Object.keys(result.data)}}});
  });
  return Response.json({ok:true});
 }catch(error){return apiError(error);}
}
