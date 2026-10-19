import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { searchPublicBusinesses } from '@/lib/discovery-search';
import { aiConfiguration } from '@/lib/ai-provider';
import { companySchema, normalizeWebsite } from '@/lib/validation';
import { createInitialCompanyScore } from '@/lib/score-service';

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
    const [candidates, sectorRuns] = await Promise.all([
      db.discoveryCandidate.findMany({ where: { organizationId: member.organizationId, status: 'NEW' }, orderBy: { discoveredAt: 'desc' }, take: 100 }),
      Promise.all(sectors.map(sector => db.discoverySearchRun.findFirst({ where: { organizationId: member.organizationId, sector }, orderBy: { startedAt: 'desc' } }))),
    ]);
    const runs = sectorRuns.filter(run => run !== null).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
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
    const input = z.object({ id: z.string().min(1), status: z.enum(['DISMISSED', 'ADDED']), website: z.union([z.url().max(2048), z.literal('')]).optional() }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, 'Choose a candidate and review status');
    const result = await db.$transaction(async tx => {
      const candidate = await tx.discoveryCandidate.findFirst({ where: { id: input.data.id, organizationId: member.organizationId, status: 'NEW' } });
      if (!candidate) throw new ApiError(404, 'Candidate not found in review queue');
      let companyId: string | undefined;
      if (input.data.status === 'ADDED') {
        const parsed = companySchema.safeParse({ name: candidate.name, website: input.data.website ?? candidate.website, industry: candidate.industry, city: candidate.city, country: 'Zimbabwe', source: 'Automatic public web discovery', notes: `Research source: ${candidate.sourceUrl}` });
        if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
        let website;
        try { website = normalizeWebsite(parsed.data.website); } catch { throw new ApiError(400, 'Invalid public website URL'); }
        const existing = await tx.prospectCompany.findFirst({ where: { organizationId: member.organizationId, OR: [{ name: { equals: parsed.data.name, mode: 'insensitive' } }, ...(website.domain ? [{ domain: website.domain }] : [])] }, select: { id: true } });
        if (existing) throw new ApiError(409, 'This company is already in the CRM');
        const company = await tx.prospectCompany.create({ data: { ...parsed.data, ...website, organizationId: member.organizationId } });
        await createInitialCompanyScore(tx, company);
        companyId = company.id;
        await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'COMPANY_CREATED', entityId: company.id, detail: { discoveryCandidateId: candidate.id } } });
      }
      const changed = await tx.discoveryCandidate.updateMany({ where: { id: candidate.id, organizationId: member.organizationId, status: 'NEW' }, data: { status: input.data.status, reviewedAt: new Date() } });
      if (!changed.count) throw new ApiError(409, 'Candidate was already reviewed');
      return { ok: true, companyId };
    });
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
