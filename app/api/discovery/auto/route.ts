import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { searchPublicBusinesses } from '@/lib/discovery-search';
import { aiConfiguration } from '@/lib/ai-provider';

const sectors = ['Industrial', 'FMCG', 'Logistics', 'Health', 'Tech', 'Real Estate'] as const;
const sectorSchema = z.enum(sectors);

function isInternal(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET || '';
  const got = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  return secret.length >= 32 && got.length === secret.length && timingSafeEqual(Buffer.from(secret), Buffer.from(got));
}

async function runSector(organizationId: string, sector: typeof sectors[number], force = false) {
  const latest = await db.discoverySearchRun.findFirst({ where: { organizationId, sector }, orderBy: { startedAt: 'desc' } });
  if (latest && ((!force && latest.status === 'COMPLETED' && Date.now() - latest.startedAt.getTime() < 20 * 3600000) || (latest.status === 'RUNNING' && Date.now() - latest.startedAt.getTime() < 2 * 60000))) return { sector, skipped: true, discovered: latest.resultCount };
  const run = await db.discoverySearchRun.create({ data: { organizationId, sector } });
  try {
    const [existing, previouslyReviewed] = await Promise.all([
      db.prospectCompany.findMany({ where: { organizationId }, select: { name: true, domain: true } }),
      db.discoveryCandidate.findMany({ where: { organizationId }, select: { name: true, website: true }, orderBy: { discoveredAt: 'desc' }, take: 100 }),
    ]);
    const knownNames = new Set([...existing.map(company => company.name), ...previouslyReviewed.map(candidate => candidate.name)].map(name => name.trim().toLowerCase()));
    const knownDomains = new Set([...existing.map(company => company.domain).filter((domain): domain is string => Boolean(domain)), ...previouslyReviewed.map(candidate => new URL(candidate.website).hostname.toLowerCase().replace(/^www\./, ''))]);
    const excludedDomains = [...knownDomains].slice(0, 80);
    const candidates = await searchPublicBusinesses({ industry: sector, location: 'Zimbabwe', limit: 6, excludedDomains });
    const filtered = candidates.filter(candidate => {
      const name = candidate.name.trim().toLowerCase();
      const domain = new URL(candidate.website).hostname.toLowerCase().replace(/^www\./, '');
      return !knownNames.has(name) && !knownDomains.has(domain);
    }).slice(0, 3);
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
    const config = aiConfiguration();
    return Response.json({ candidates, runs, sectors, searchConfigured: config.configured && config.baseUrl?.origin === 'https://api.openai.com' });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const internal = isInternal(request);
    if (!internal) sameOrigin(request);
    const member = internal ? null : await requireMember(true);
    const input = z.object({ sector: sectorSchema, force: z.boolean().optional() }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, 'Choose a configured target sector');
    const organizations = member ? [member.organizationId] : (await db.organization.findMany({ where: { id: 'spiritus' }, select: { id: true } })).map(item => item.id);
    if (!organizations.length) throw new ApiError(503, 'The Spiritus workspace has not been initialized. Run the seed step before automatic discovery.');
    const results = [];
    for (const organizationId of organizations) results.push(await runSector(organizationId, input.data.sector, Boolean(member && input.data.force)));
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
