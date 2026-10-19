import type { Prisma, ProspectCompany } from '@prisma/client';
import { scoreProspect } from '@/lib/scoring';

export const scoringInclude = {
  activities: { orderBy: { createdAt: 'desc' }, take: 20 },
  followUpTasks: { where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' }, take: 20, select: { dueAt: true } },
  audits: { orderBy: { createdAt: 'desc' }, take: 1, include: { findings: true } },
} as const satisfies Prisma.ProspectCompanyInclude;

export function createInitialCompanyScore(tx: Prisma.TransactionClient, company: ProspectCompany) {
  const result = scoreProspect(company);
  return tx.leadScore.create({
    data: { companyId: company.id, total: result.total, breakdown: result.breakdown, explanation: result.explanation },
  });
}

export async function recalculateCompanyScore(tx: Prisma.TransactionClient, companyId: string) {
  const company = await tx.prospectCompany.findUniqueOrThrow({
    where: { id: companyId },
    include: scoringInclude,
  });
  const result = scoreProspect(company);
  return tx.leadScore.upsert({
    where: { companyId },
    create: { companyId, total: result.total, breakdown: result.breakdown, explanation: result.explanation },
    update: { total: result.total, breakdown: result.breakdown, explanation: result.explanation },
  });
}
