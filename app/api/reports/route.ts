import { db } from '@/lib/db';
import { apiError, ApiError, requireMember } from '@/lib/access';
import { summarizePipeline } from '@/lib/reporting';

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const days = Number(new URL(request.url).searchParams.get('days') || '30');
    if (![7, 30, 90].includes(days)) throw new ApiError(400, 'Choose a 7, 30 or 90 day reporting window');
    const since = new Date(Date.now() - days * 86400000);
    const now = new Date();
    const org = member.organizationId;
    const [stageGroups, sourceGroups, industryGroups, newProspects, auditCount, recentAudits, dueTasks, draftProposals, scores] = await Promise.all([
      db.prospectCompany.groupBy({ by: ['stage'], where: { organizationId: org }, _count: { _all: true }, _sum: { dealValue: true } }),
      db.prospectCompany.groupBy({ by: ['source'], where: { organizationId: org }, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 8 }),
      db.prospectCompany.groupBy({ by: ['industry'], where: { organizationId: org }, _count: { _all: true }, orderBy: { _count: { industry: 'desc' } }, take: 8 }),
      db.prospectCompany.count({ where: { organizationId: org, createdAt: { gte: since } } }),
      db.websiteAudit.count({ where: { company: { organizationId: org } } }),
      db.websiteAudit.count({ where: { company: { organizationId: org }, createdAt: { gte: since } } }),
      db.followUpTask.count({ where: { organizationId: org, status: 'OPEN', dueAt: { lte: now } } }),
      db.proposal.count({ where: { organizationId: org, status: 'DRAFT' } }),
      db.leadScore.findMany({ where: { company: { organizationId: org } }, select: { total: true, override: true } }),
    ]);
    const stages = stageGroups.map(row => ({ stage: row.stage, count: row._count._all, value: Number(row._sum.dealValue || 0) }));
    const totalProspects = stages.reduce((sum, row) => sum + row.count, 0);
    return Response.json({
      days,
      totals: { totalProspects, newProspects, highPriority: scores.filter(score => (score.override ?? score.total) >= 80).length, auditCount, recentAudits, dueTasks, draftProposals, ...summarizePipeline(stages) },
      stages,
      sources: sourceGroups.map(row => ({ label: row.source || 'Unspecified', count: row._count._all })),
      industries: industryGroups.map(row => ({ label: row.industry || 'Unclassified', count: row._count._all })),
    });
  } catch (error) { return apiError(error); }
}
