import { z } from 'zod';
import { apiError, requireMember, sameOrigin } from '@/lib/access';
import { queueAudit } from '@/lib/crawl-queue';
export async function POST(request:Request){try{sameOrigin(request);const m=await requireMember(true);const {companyId}=z.object({companyId:z.string(),authorized:z.literal(true)}).parse(await request.json());const job=await queueAudit({organizationId:m.organizationId,companyId,approvedBy:m.userId});return Response.json(job,{status:202});}catch(e){return apiError(e);}}
