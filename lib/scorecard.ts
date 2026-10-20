import { db } from '@/lib/db';
import { channelRows, segmentMultipliers, segmentStats, weekStart, weeklyRows, type OutcomeLog } from '@/lib/sales-insights';

const learningWindowDays = 365;

// Outcomes come from the structured OUTCOME_LOGGED audit records written by one-click results on Today.
async function outcomeLogs(organizationId: string, since: Date): Promise<OutcomeLog[]> {
  const rows = await db.auditLog.findMany({ where: { organizationId, action: 'OUTCOME_LOGGED', createdAt: { gte: since } }, select: { entityId: true, createdAt: true, detail: true }, take: 20000 });
  return rows.flatMap(row => {
    const detail = row.detail as { outcome?: unknown; channel?: unknown } | null;
    return typeof detail?.outcome === 'string' && typeof detail.channel === 'string' ? [{ companyId: row.entityId, outcome: detail.outcome, channel: detail.channel, at: row.createdAt }] : [];
  });
}

async function segmentPerformance(organizationId: string) {
  const since = new Date(Date.now() - learningWindowDays * 86400000);
  const [companies, logs] = await Promise.all([
    db.prospectCompany.findMany({ where: { organizationId, segment: { not: '' } }, select: { id: true, segment: true, stage: true } }),
    outcomeLogs(organizationId, since),
  ]);
  return segmentStats(companies, logs);
}

export async function learnedMultipliers(organizationId: string) {
  return segmentMultipliers(await segmentPerformance(organizationId));
}

export async function buildScorecard(organizationId: string, weeks = 6) {
  const since = weekStart(new Date(Date.now() - (weeks - 1) * 7 * 86400000));
  const [organization, logs, wins, segments] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { weeklyTouchTarget: true } }),
    outcomeLogs(organizationId, since),
    db.dealActivity.findMany({ where: { company: { organizationId }, type: 'STAGE_CHANGED', body: { endsWith: '→ WON' }, createdAt: { gte: since } }, select: { createdAt: true } }),
    segmentPerformance(organizationId),
  ]);
  const multipliers = segmentMultipliers(segments);
  return {
    weeklyTouchTarget: organization.weeklyTouchTarget,
    weeks: weeklyRows(logs, wins.map(win => win.createdAt), weeks),
    channels: channelRows(logs),
    segments: segments.map(row => ({ ...row, multiplier: multipliers[row.name] ?? 1 })),
    learning: Object.keys(multipliers).length > 0,
  };
}
