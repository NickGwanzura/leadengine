import { db } from '@/lib/db';
import { ApiError, apiError } from '@/lib/access';
import { queueAutomaticAudits } from '@/lib/crawl-queue';
import { isInternalRequest } from '@/lib/internal-auth';

// Scheduler tick: backfill audits for unaudited companies in every workspace that has auto-audit on.
export async function POST(request: Request) {
  try {
    if (!isInternalRequest(request)) throw new ApiError(401, 'Unauthorized');
    const organizations = await db.organization.findMany({ where: { autoAuditBy: { not: null } }, select: { id: true } });
    const results = [];
    for (const { id } of organizations) results.push({ organizationId: id, ...await queueAutomaticAudits(id, 5) });
    return Response.json({ results });
  } catch (error) { return apiError(error); }
}
