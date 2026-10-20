import { timingSafeEqual } from 'node:crypto';

/** True when the request carries the INTERNAL_API_SECRET bearer used by the scheduler and worker. */
export function isInternalRequest(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET || '';
  const got = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  return secret.length >= 32 && got.length === secret.length && timingSafeEqual(Buffer.from(secret), Buffer.from(got));
}
