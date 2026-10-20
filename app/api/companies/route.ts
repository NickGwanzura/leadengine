import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiError,requireMember,sameOrigin } from '@/lib/access';
import { companySchema,normalizeWebsite } from '@/lib/validation';
import { createInitialCompanyScore } from '@/lib/score-service';
import { scoreProspect } from '@/lib/scoring';

// Fields the workspace needs to render tables, pipeline and job progress.
// Audits, findings and timeline entries are fetched per company instead.
const summarySelect = {
 name:true,id:true,domain:true,website:true,industry:true,city:true,country:true,email:true,phone:true,
 notes:true,stage:true,dealValue:true,createdAt:true,updatedAt:true,nextFollowUp:true,assignedProduct:true,
 contactPerson:true,contactPosition:true,sizeEstimate:true,
 score:{select:{total:true,override:true,explanation:true,updatedAt:true}},
 _count:{select:{audits:true}},
 jobs:{orderBy:{createdAt:'desc'},take:1,select:{id:true,status:true,progress:true,error:true,createdAt:true}},
} satisfies Prisma.ProspectCompanySelect;

export async function GET(request:Request){
 try{
  const m=await requireMember();
  if(new URL(request.url).searchParams.get('view')==='summary'){
   const companies=await db.prospectCompany.findMany({where:{organizationId:m.organizationId},select:summarySelect,orderBy:{createdAt:'desc'},take:1000});
   const items=companies.map(company=>({...company,score:company.score??{...scoreProspect(company),override:null,updatedAt:company.updatedAt}}));
   const body=JSON.stringify(items);
   const etag=`"${createHash('sha1').update(body).digest('base64url')}"`;
   const headers={'cache-control':'private, no-cache',etag};
   // Polling re-uses the previous payload until any record or job progress changes.
   if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
   return new Response(body,{status:200,headers:{...headers,'content-type':'application/json'}});
  }
  const companies=await db.prospectCompany.findMany({where:{organizationId:m.organizationId},include:{score:true,_count:{select:{audits:true}},jobs:{orderBy:{createdAt:'desc'},take:1},audits:{orderBy:{createdAt:'desc'},take:1,include:{findings:true,pages:true}},activities:{orderBy:{createdAt:'desc'},take:20},followUpTasks:{where:{status:'OPEN'},orderBy:{dueAt:'asc'},take:20,select:{dueAt:true}}},orderBy:{createdAt:'desc'},take:1000});
  return Response.json(companies.map(company=>({...company,score:company.score??{...scoreProspect(company),override:null,updatedAt:company.updatedAt}})));
 }catch(e){return apiError(e);}
}

export async function POST(request:Request){
 try{
  sameOrigin(request);
  const m=await requireMember(true);
  const parsed=companySchema.safeParse(await request.json());
  if(!parsed.success)return Response.json({error:parsed.error.issues[0].message},{status:400});
  let website;
  try{website=normalizeWebsite(parsed.data.website);}catch{return Response.json({error:'Invalid public website URL'},{status:400});}
  const company=await db.$transaction(async tx=>{
   const c=await tx.prospectCompany.create({data:{...parsed.data,...website,organizationId:m.organizationId}});
   await createInitialCompanyScore(tx,c);
   await tx.auditLog.create({data:{organizationId:m.organizationId,userId:m.userId,action:'COMPANY_CREATED',entityId:c.id,detail:{}}});
   return c;
  });
  return Response.json(company,{status:201});
 }catch(e){return apiError(e);}
}
