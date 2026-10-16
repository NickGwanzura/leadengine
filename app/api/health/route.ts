import { db } from '@/lib/db';
import { redis,connectRedis } from '@/lib/redis';
export async function GET(){try{await db.$queryRaw`SELECT 1`;await connectRedis();await redis.ping();return Response.json({status:'ok'});}catch{return Response.json({status:'unavailable'},{status:503});}}
