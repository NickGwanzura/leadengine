import { db } from '@/lib/db';
import { redis, connectRedis } from '@/lib/redis';
import { ApiError } from '@/lib/access';
import { validatePublicUrl } from '@/lib/url-security';

const organizationQueueLimit = 100;
// Automatic audits leave most of the queue free for audits a person asks for.
const automaticQueueLimit = 20;

/** Queues one audit, or returns the company's active one. `approvedBy` is the accountable user. */
export async function queueAudit({ organizationId, companyId, approvedBy, automatic = false }: { organizationId: string; companyId: string; approvedBy: string; automatic?: boolean }) {
  const company = await db.prospectCompany.findFirst({ where: { id: companyId, organizationId } });
  if (!company?.website) throw new ApiError(400, 'Company needs a website');
  try { await validatePublicUrl(company.website); } catch { throw new ApiError(400, 'Website must resolve exclusively to public HTTP(S) addresses'); }
  const job = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    const existing = await tx.crawlJob.findFirst({ where: { companyId, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (existing) return existing;
    const queued = await tx.crawlJob.count({ where: { company: { organizationId }, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (queued >= (automatic ? automaticQueueLimit : organizationQueueLimit)) throw new ApiError(429, 'Organization queue limit reached');
    const created = await tx.crawlJob.create({ data: { companyId, url: company.website!, approvedDomain: new URL(company.website!).hostname, approvedBy } });
    await tx.auditLog.create({ data: { organizationId, userId: approvedBy, action: automatic ? 'CRAWL_AUTO_AUTHORIZED' : 'CRAWL_AUTHORIZED', entityId: created.id, detail: { url: created.url } } });
    return created;
  });
  // PostgreSQL is the durable outbox; Redis is the wake-up queue. Worker polls to recover lost wake-ups.
  try { await connectRedis(); await redis.lpush('crawl:wakeup', job.id); await redis.ltrim('crawl:wakeup', 0, 999); } catch { /* Durable queued row is picked up on the next worker poll. */ }
  return job;
}

/** The member who switched auto-audit on, if it is on and they can still write in this workspace. */
export async function autoAuditApprover(organizationId: string) {
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { autoAuditBy: true } });
  if (!organization?.autoAuditBy) return null;
  const member = await db.organizationMember.findFirst({ where: { organizationId, userId: organization.autoAuditBy, role: { not: 'VIEWER' } }, select: { userId: true } });
  return member?.userId ?? null;
}

/** Queues audits for companies that have a website but have never been audited, newest first. */
export async function queueAutomaticAudits(organizationId: string, limit = 5, companyIds?: string[]) {
  const approvedBy = await autoAuditApprover(organizationId);
  if (!approvedBy) return { queued: 0, enabled: false };
  const companies = await db.prospectCompany.findMany({
    where: { organizationId, website: { not: null }, stage: { notIn: ['WON', 'LOST'] }, jobs: { none: {} }, ...(companyIds ? { id: { in: companyIds } } : {}) },
    orderBy: { createdAt: 'desc' }, take: limit, select: { id: true },
  });
  let queued = 0;
  for (const company of companies) {
    try { await queueAudit({ organizationId, companyId: company.id, approvedBy, automatic: true }); queued++; }
    catch (error) { if (error instanceof ApiError && error.status === 429) break; /* skip companies whose site is not public */ }
  }
  return { queued, enabled: true };
}
