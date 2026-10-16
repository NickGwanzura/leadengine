import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/redis';
export const { handlers, auth, signIn, signOut } = NextAuth({
 session:{strategy:'jwt',maxAge:60*60*8},pages:{signIn:'/login'},
 providers:[Credentials({credentials:{email:{},password:{}},authorize:async credentials=>{
 const result=z.object({email:z.email(),password:z.string().min(12).max(200)}).safeParse(credentials);
 if(!result.success)return null;
 await rateLimit(`login:${result.data.email.toLowerCase()}`,10);
 const user=await db.user.findUnique({where:{email:result.data.email.toLowerCase()}});
 const hash=user?.passwordHash ?? '$2b$12$4h7/.6a5ODRGe6hVQF4BvujCTQx1tAz9srwyO5.SfGZqJ.qLMZe0m';
 if(!await compare(result.data.password,hash)||!user)return null;
 return {id:user.id,email:user.email,name:user.name};
 }})],callbacks:{jwt({token,user}){if(user)token.sub=user.id;return token;},session({session,token}){if(session.user&&token.sub)session.user.id=token.sub;return session;}}
});
