import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { searchPublicBusinesses } from '@/lib/discovery-search';

const sectors = ['Industrial', 'FMCG', 'Logistics', 'Health', 'Tech', 'Real Estate'] as const;
const sectorSchema = z.enum(sectors);

function isInternal(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET || '';
  const got = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  return secret.length >= 32 && got.length === secret.length && timingSafeEqual(Buffer.from(secret), Buffer.from(got));
}

async function runSector(organizationId: string, sector: typeof sectors[number]) {
  const latest = await db.discoverySearchRun.findFirst({ where: { organizationId, sector }, orderBy: { startedAt: 'desc' } });
  if (latest && ((latest.status === 'COMPLETED' && Date.now() - latest.startedAt.getTime() < 20 * 3600000) || (latest.status === 'RUNNING' && Date.now() - latest.startedAt.getTime() < 2 * 60000))) return { sector, skipped: true, discovered: latest.resultCount };
  const run = await db.discoverySearchRun.create({ data: { organizationId, sector } });
  try {
    const candidates = await searchPublicBusinesses({ industry: sector, location: 'Zimbabwe', limit: 3 });
    const existing = await db.prospectCompany.findMany({ where: { organizationId }, select: { name: true, domain: true } });
    const filtered = candidates.filter(candidate => {
      const name = candidate.name.trim().toLowerCase();
      const domain = new URL(candidate.website).hostname.toLowerCase().replace(/^www\./, '');
      return !existing.some(company => company.name.trim().toLowerCase() === name || company.domain === domain);
    });
    const inserted = await db.discoveryCandidate.createMany({ data: filtered.map(candidate => ({ ...candidate, organizationId })), skipDuplicates: true });
    await db.discoverySearchRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', resultCount: inserted.count, finishedAt: new Date() } });
    return { sector, skipped: false, discovered: inserted.count };
  } catch (error) {
    await db.discoverySearchRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 200) : 'Search failed', finishedAt: new Date() } });
    throw error;
  }
}

export async function GET() {
  try {
    const member = await requireMember();
    const [candidates, runs] = await Promise.all([
      db.discoveryCandidate.findMany({ where: { organizationId: member.organizationId, status: 'NEW' }, orderBy: { discoveredAt: 'desc' }, take: 100 }),
      db.discoverySearchRun.findMany({ where: { organizationId: member.organizationId }, orderBy: { startedAt: 'desc' }, take: 12 }),
    ]);
    return Response.json({ candidates, runs, sectors });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const internal = isInternal(request);
    if (!internal) sameOrigin(request);
    const member = internal ? null : await requireMember(true);
    const input = z.object({ sector: sectorSchema }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, 'Choose a configured target sector');
    const organizations = member ? [member.organizationId] : (await db.organization.findMany({ where: { id: 'spiritus' }, select: { id: true } })).map(item => item.id);
    const results = [];
    for (const organizationId of organizations) results.push(await runSector(organizationId, input.data.sector));
    return Response.json({ results });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const input = z.object({ id: z.string().min(1), status: z.enum(['DISMISSED', 'ADDED']) }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, 'Choose a candidate and review status');
    const changed = await db.discoveryCandidate.updateMany({ where: { id: input.data.id, organizationId: member.organizationId, status: 'NEW' }, data: { status: input.data.status, reviewedAt: new Date() } });
    if (!changed.count) throw new ApiError(404, 'Candidate not found in review queue');
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
