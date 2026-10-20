import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { searchPublicBusinesses } from '@/lib/discovery-search';
import { aiConfiguration } from '@/lib/ai-provider';
import { isInternalRequest } from '@/lib/internal-auth';
import { companySchema, normalizeWebsite } from '@/lib/validation';
import { createInitialCompanyScore } from '@/lib/score-service';
import { isDue, readSegments, refreshHours, staleRunMs } from '@/lib/business-profile';
import { precheckLead } from '@/lib/lead-precheck';
import { queueAutomaticAudits } from '@/lib/crawl-queue';
import { learnedMultipliers } from '@/lib/scorecard';

type Target = { name: string; industry: string; location: string; keywords: string; painPoint: string; service: string };
const legacySectors = ['Industrial', 'FMCG', 'Logistics', 'Health', 'Tech', 'Real Estate'];


// An analysed business profile drives the search; without one the original six sectors still run.
async function targetsFor(organizationId: string) {
  const profile = await db.businessProfile.findUnique({ where: { organizationId } });
  // Segments from the last successful analysis keep running even if a later re-analysis failed.
  const segments = profile ? readSegments(profile.segments) : [];
  if (profile && segments.length) return { fromProfile: true, active: profile.active, offering: profile.summary, targets: segments.map(segment => ({ ...segment })) };
  return { fromProfile: false, active: !profile || profile.active, offering: '', targets: legacySectors.map(sector => ({ name: sector, industry: sector, location: 'Zimbabwe', keywords: '', painPoint: '', service: '' })) };
}

async function latestRuns(organizationId: string, names: string[]) {
  const runs = await db.discoverySearchRun.findMany({ where: { organizationId, sector: { in: names } }, orderBy: { startedAt: 'desc' }, take: 300 });
  const latest = new Map<string, typeof runs[number]>();
  for (const run of runs) if (!latest.has(run.sector)) latest.set(run.sector, run);
  return latest;
}

async function runTarget(organizationId: string, target: Target, offering: string, force = false) {
  const latest = (await latestRuns(organizationId, [target.name])).get(target.name);
  if (latest && ((!force && !isDue(latest)) || (latest.status === 'RUNNING' && Date.now() - latest.startedAt.getTime() < staleRunMs))) return { sector: target.name, skipped: true, discovered: latest.resultCount };
  const run = await db.discoverySearchRun.create({ data: { organizationId, sector: target.name } });
  try {
    const [existing, previouslyReviewed] = await Promise.all([
      db.prospectCompany.findMany({ where: { organizationId }, select: { name: true, domain: true } }),
      db.discoveryCandidate.findMany({ where: { organizationId }, select: { name: true, website: true, sourceUrl: true }, orderBy: { discoveredAt: 'desc' }, take: 300 }),
    ]);
    const knownNames = new Set([...existing.map(company => company.name), ...previouslyReviewed.map(candidate => candidate.name)].map(name => name.trim().toLowerCase()));
    const reviewedBusinessDomains = previouslyReviewed.flatMap(candidate => {
      try {
        const website = new URL(candidate.website);
        const source = new URL(candidate.sourceUrl);
        if (website.hostname === source.hostname && website.pathname.split('/').filter(Boolean).length > 1) return [];
        return [website.hostname.toLowerCase().replace(/^www\./, '')];
      } catch { return []; }
    });
    const knownDomains = new Set([...existing.map(company => company.domain).filter((domain): domain is string => Boolean(domain)), ...reviewedBusinessDomains]);
    const excludedDomains = [...knownDomains].slice(0, 80);
    const candidates = await searchPublicBusinesses({ industry: target.industry, location: target.location, keywords: target.keywords, service: target.service, painPoint: target.painPoint, offering, limit: 10, excludedDomains });
    const filtered = candidates.filter(candidate => {
      const name = candidate.name.trim().toLowerCase();
      const domain = new URL(candidate.website).hostname.toLowerCase().replace(/^www\./, '');
      return !knownNames.has(name) && !knownDomains.has(domain);
    }).slice(0, 5);
    const inserted = await db.discoveryCandidate.createMany({ data: filtered.map(candidate => ({ ...candidate, segment: target.name, organizationId })), skipDuplicates: true });
    await rankNewCandidates(organizationId, filtered.map(candidate => candidate.website));
    await db.discoverySearchRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', resultCount: inserted.count, finishedAt: new Date() } });
    return { sector: target.name, skipped: false, discovered: inserted.count };
  } catch (error) {
    await db.discoverySearchRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 200) : 'Search failed', finishedAt: new Date() } });
    throw error;
  }
}

// Homepage pre-check so the review queue opens with the most workable leads first.
async function rankNewCandidates(organizationId: string, websites: string[]) {
  const fresh = await db.discoveryCandidate.findMany({ where: { organizationId, website: { in: websites }, status: 'NEW', signals: { equals: [] } }, select: { id: true, website: true } });
  await Promise.allSettled(fresh.map(async candidate => {
    const { rank, signals } = await precheckLead(candidate.website);
    await db.discoveryCandidate.update({ where: { id: candidate.id }, data: { rank, signals } });
  }));
}

// Scheduler tick: run the single most overdue target for each workspace that is searching.
async function runNextDue(organizationId: string) {
  const { active, targets, offering } = await targetsFor(organizationId);
  if (!active) return { organizationId, paused: true };
  const [latest, multipliers] = await Promise.all([latestRuns(organizationId, targets.map(target => target.name)), learnedMultipliers(organizationId)]);
  // Groups that convert are searched more often; weak groups less often (see lib/sales-insights).
  const due = targets.filter(target => isDue(latest.get(target.name), Date.now(), refreshHours * (multipliers[target.name] ?? 1))).sort((a, b) => (latest.get(a.name)?.startedAt.getTime() ?? 0) - (latest.get(b.name)?.startedAt.getTime() ?? 0))[0];
  if (!due) return { organizationId, idle: true };
  return { organizationId, ...await runTarget(organizationId, due, offering) };
}

export async function GET() {
  try {
    const member = await requireMember();
    const { targets, fromProfile, active } = await targetsFor(member.organizationId);
    const [candidates, recentCandidates, reviewedCandidates, latest, multipliers] = await Promise.all([
      db.discoveryCandidate.findMany({ where: { organizationId: member.organizationId, status: 'NEW' }, orderBy: [{ rank: 'desc' }, { discoveredAt: 'desc' }], take: 100 }),
      db.discoveryCandidate.findMany({ where: { organizationId: member.organizationId }, orderBy: { discoveredAt: 'desc' }, take: 60 }),
      db.discoveryCandidate.findMany({ where: { organizationId: member.organizationId, status: { in: ['ADDED', 'DISMISSED'] } }, orderBy: { reviewedAt: 'desc' }, take: 60 }),
      latestRuns(member.organizationId, targets.map(target => target.name)),
      learnedMultipliers(member.organizationId),
    ]);
    const intervals = Object.fromEntries(targets.map(target => [target.name, Math.round(refreshHours * (multipliers[target.name] ?? 1) * 10) / 10]));
    const runs = [...latest.values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const config = aiConfiguration();
    return Response.json({ candidates, recentCandidates, reviewedCandidates, runs, sectors: targets.map(target => target.name), intervals, fromProfile, active, refreshHours, searchConfigured: config.configured && config.baseUrl?.origin === 'https://api.openai.com' }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const internal = isInternalRequest(request);
    if (!internal) sameOrigin(request);
    const member = internal ? null : await requireMember(true);
    const input = z.object({ next: z.literal(true).optional(), sector: z.string().trim().min(1).max(80).optional(), force: z.boolean().optional() }).safeParse(await request.json());
    if (!input.success || (!input.data.next && !input.data.sector)) throw new ApiError(400, 'Choose a target to search');
    if (member) {
      const { targets, offering } = await targetsFor(member.organizationId);
      const target = targets.find(item => item.name === input.data.sector);
      if (!target) throw new ApiError(400, 'That target is not in your current search plan');
      return Response.json({ results: [await runTarget(member.organizationId, target, offering, Boolean(input.data.force))] });
    }
    const organizations = (await db.organization.findMany({ where: { OR: [{ id: 'spiritus' }, { businessProfile: { active: true, analysedAt: { not: null } } }] }, select: { id: true } })).map(item => item.id);
    if (!organizations.length) throw new ApiError(503, 'The Spiritus workspace has not been initialized. Run the seed step before automatic discovery.');
    const results = [];
    for (const organizationId of organizations) {
      if (input.data.next) { results.push(await runNextDue(organizationId).catch(error => ({ organizationId, error: error instanceof Error ? error.message : 'Search failed' }))); continue; }
      const { targets, offering } = await targetsFor(organizationId);
      const target = targets.find(item => item.name === input.data.sector);
      if (target) results.push(await runTarget(organizationId, target, offering));
    }
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
        const parsed = companySchema.safeParse({ name: candidate.name, website: input.data.website ?? candidate.website, industry: candidate.industry, city: candidate.city, country: 'Zimbabwe', source: 'Automatic public web discovery', notes: [`Research source: ${candidate.sourceUrl}`, candidate.fitReason && `Why they may fit: ${candidate.fitReason}`, candidate.segment && `Target segment: ${candidate.segment}`].filter(Boolean).join('\n') });
        if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
        let website;
        try { website = normalizeWebsite(parsed.data.website); } catch { throw new ApiError(400, 'Invalid public website URL'); }
        const existing = await tx.prospectCompany.findFirst({ where: { organizationId: member.organizationId, OR: [{ name: { equals: parsed.data.name, mode: 'insensitive' } }, ...(website.domain ? [{ domain: website.domain }] : [])] }, select: { id: true } });
        if (existing) throw new ApiError(409, 'This company is already in the CRM');
        const company = await tx.prospectCompany.create({ data: { ...parsed.data, ...website, segment: candidate.segment, organizationId: member.organizationId } });
        await createInitialCompanyScore(tx, company);
        companyId = company.id;
        await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'COMPANY_CREATED', entityId: company.id, detail: { discoveryCandidateId: candidate.id } } });
      }
      const changed = await tx.discoveryCandidate.updateMany({ where: { id: candidate.id, organizationId: member.organizationId, status: 'NEW' }, data: { status: input.data.status, reviewedAt: new Date() } });
      if (!changed.count) throw new ApiError(409, 'Candidate was already reviewed');
      return { ok: true, companyId };
    });
    if (result.companyId) await queueAutomaticAudits(member.organizationId, 1, [result.companyId]).catch(() => undefined);
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
