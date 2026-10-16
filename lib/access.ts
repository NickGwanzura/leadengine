import { auth } from '@/auth';
import { db } from './db';
import { rateLimit } from './redis';
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export async function requireMember(write=false) {
 const session=await auth();
 if(!session?.user?.id)throw new ApiError(401,'Please sign in');
 const member=await db.organizationMember.findFirst({where:{userId:session.user.id},orderBy:{id:'asc'}});
 if(!member)throw new ApiError(403,'Organization access required');
 if(write&&member.role==='VIEWER')throw new ApiError(403,'Read-only access');
 if(write)await rateLimit(`write:${member.userId}`);
 return member;
}
export function apiError(error:unknown) {
 if(error instanceof ApiError)return Response.json({error:error.message},{status:error.status});
 if(error instanceof Error&&error.message==='RATE_LIMIT')return Response.json({error:'Too many requests'},{status:429});
 if(error && typeof error==='object' && 'code' in error && error.code==='P2002')return Response.json({error:'This domain already exists in your organization'},{status:409});
 console.error('Request failed',error instanceof Error?error.name:'UnknownError');
 return Response.json({error:'Request failed. Check the service configuration and try again.'},{status:500});
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(process.env.AUTH_URL||request.url).origin)throw new ApiError(403,'Invalid request origin');}
