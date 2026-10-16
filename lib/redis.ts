import Redis from 'ioredis';
const state = globalThis as unknown as { redis?: Redis };
export const redis = state.redis ?? new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {lazyConnect:true,maxRetriesPerRequest:1,enableOfflineQueue:false});
redis.on('error', () => {});
if (process.env.NODE_ENV !== 'production') state.redis = redis;
export async function connectRedis() { if(redis.status === 'wait') await redis.connect(); }
export async function rateLimit(key:string, limit=60) {
 await connectRedis();
 const count = await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",1,`rate:${key}`) as number;
 if(count>limit) throw new Error('RATE_LIMIT');
}
