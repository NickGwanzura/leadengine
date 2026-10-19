import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, requireMember, sameOrigin, ApiError } from '@/lib/access';
import { categoryFor, scoreProspect } from '@/lib/scoring';
import { recommendOpportunities } from '@/lib/opportunities';

const recalculateInput = z.object({ companyIds: z.array(z.string().min(1)).max(500).optional() }).default({});
const overrideInput = z.object({
  companyId: z.string().min(1),
  override: z.number().int().min(0).max(100).nullable(),
  reason: z.string().trim().min(3).max(500),
});

export async function GET() {
  try {
    const member = await requireMember();
    const [companies, packages] = await Promise.all([
      db.prospectCompany.findMany({
        where: { organizationId: member.organizationId },
        include: {
          score: true,
          activities: { orderBy: { createdAt: 'desc' }, take: 20, select: { createdAt: true, type: true } },
          followUpTasks: { where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' }, take: 20, select: { dueAt: true } },
          audits: { orderBy: { createdAt: 'desc' }, take: 1, include: { findings: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      db.productPackage.findMany({ where: { organizationId: member.organizationId }, orderBy: { price: 'asc' } }),
    ]);
    const configuredPackages = packages.map(pkg => ({ name: pkg.name, price: pkg.price.toString(), fromPrice: pkg.fromPrice, currency: pkg.currency }));
    return Response.json({
      items: companies.map(company => {
        const score = company.score ?? { ...scoreProspect(company), override: null, updatedAt: company.updatedAt };
        return {
          id: company.id,
          name: company.name,
          industry: company.industry,
          website: company.website,
          stage: company.stage,
          dealValue: company.dealValue.toString(),
          sizeEstimate: company.sizeEstimate,
          assignedProduct: company.assignedProduct,
          score: {
            total: score.total,
            override: score.override,
            effectiveTotal: score.override ?? score.total,
            category: categoryFor(score.override ?? score.total),
            breakdown: score.breakdown,
            explanation: score.explanation,
            updatedAt: score.updatedAt,
          },
          recommendations: recommendOpportunities(company, configuredPackages),
        };
      }),
      packages: configuredPackages,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const parsed = recalculateInput.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError(400, 'Invalid scoring request');
    let scored = 0;
    let cursor: string | undefined;
    while (true) {
      const companies = await db.prospectCompany.findMany({
        where: { organizationId: member.organizationId, ...(parsed.data.companyIds ? { id: { in: parsed.data.companyIds } } : {}) },
        include: {
          activities: { orderBy: { createdAt: 'desc' }, take: 20 },
          followUpTasks: { where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' }, take: 20, select: { dueAt: true } },
          audits: { orderBy: { createdAt: 'desc' }, take: 1, include: { findings: true } },
        },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!companies.length) break;
      const scores = companies.map(company => ({ company, result: scoreProspect(company) }));
      await db.$transaction(scores.map(({ company, result }) => db.leadScore.upsert({
        where: { companyId: company.id },
        create: { companyId: company.id, total: result.total, breakdown: result.breakdown, explanation: result.explanation },
        update: { total: result.total, breakdown: result.breakdown, explanation: result.explanation },
      })));
      scored += scores.length;
      cursor = companies[companies.length - 1].id;
      if (parsed.data.companyIds || companies.length < 500) break;
    }
    await db.auditLog.create({
      data: { organizationId: member.organizationId, userId: member.userId, action: 'LEAD_SCORES_RECALCULATED', entityId: member.organizationId, detail: { count: scored } },
    });
    return Response.json({ scored });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const parsed = overrideInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Provide a score from 0 to 100 (or null to clear it) and a reason');
    const { companyId, override, reason } = parsed.data;
    const company = await db.prospectCompany.findFirst({
      where: { id: companyId, organizationId: member.organizationId },
      include: {
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
        followUpTasks: { where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' }, take: 20, select: { dueAt: true } },
        audits: { orderBy: { createdAt: 'desc' }, take: 1, include: { findings: true } },
        score: true,
      },
    });
    if (!company) throw new ApiError(404, 'Company not found');
    const calculated = scoreProspect(company);
    await db.$transaction(async tx => {
      await tx.leadScore.upsert({
        where: { companyId },
        create: { companyId, total: calculated.total, breakdown: calculated.breakdown, explanation: calculated.explanation, override },
        update: { total: calculated.total, breakdown: calculated.breakdown, explanation: calculated.explanation, override },
      });
      await tx.auditLog.create({
        data: {
          organizationId: member.organizationId,
          userId: member.userId,
          action: override === null ? 'LEAD_SCORE_OVERRIDE_CLEARED' : 'LEAD_SCORE_OVERRIDDEN',
          entityId: companyId,
          detail: { previous: company.score?.override ?? company.score?.total ?? null, override, reason },
        },
      });
    });
    return Response.json({ ok: true, override, effectiveTotal: override ?? calculated.total });
  } catch (error) {
    return apiError(error);
  }
}
