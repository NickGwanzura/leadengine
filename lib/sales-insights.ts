import { stages } from '@/lib/validation';

// Zimbabwe is UTC+2 all year (no daylight saving), so local weeks and days are a fixed offset.
const harareOffsetMs = 2 * 3600000;
const weekMs = 7 * 86400000;

export type OutcomeLog = { companyId: string; outcome: string; channel: string; at: Date };
export type SegmentStats = { name: string; leads: number; contacted: number; responded: number; meetings: number; won: number };
export type WeekRow = { weekStart: string; touches: number; responses: number; meetings: number; wins: number };

/** Monday 00:00 Harare time for the week containing `date`, as a UTC Date. */
export function weekStart(date: Date) {
  const local = new Date(date.getTime() + harareOffsetMs);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - daysSinceMonday * 86400000 - harareOffsetMs);
}

export function harareDateKey(date: Date) {
  return new Date(date.getTime() + harareOffsetMs).toISOString().slice(0, 10);
}

/** The brief goes out once per Harare day, from 07:30 local time. */
export function briefDue(now: Date, sentOn: string | null) {
  const local = new Date(now.getTime() + harareOffsetMs);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minutes >= 7 * 60 + 30 && sentOn !== harareDateKey(now);
}

const responded = (outcome: string) => outcome !== 'NO_ANSWER';

export function weeklyRows(logs: OutcomeLog[], winDates: Date[], weeks: number, now = new Date()): WeekRow[] {
  const current = weekStart(now).getTime();
  const rows = Array.from({ length: weeks }, (_, index) => ({ weekStart: new Date(current - (weeks - 1 - index) * weekMs).toISOString(), touches: 0, responses: 0, meetings: 0, wins: 0 }));
  const rowFor = (date: Date) => {
    const index = weeks - 1 - Math.round((current - weekStart(date).getTime()) / weekMs);
    return rows[index];
  };
  for (const log of logs) {
    const row = rowFor(log.at);
    if (!row) continue;
    row.touches++;
    if (responded(log.outcome)) row.responses++;
    if (log.outcome === 'MEETING_BOOKED') row.meetings++;
  }
  for (const date of winDates) { const row = rowFor(date); if (row) row.wins++; }
  return rows;
}

export function channelRows(logs: OutcomeLog[]) {
  const byChannel = new Map<string, { channel: string; touches: number; responses: number }>();
  for (const log of logs) {
    const row = byChannel.get(log.channel) ?? { channel: log.channel, touches: 0, responses: 0 };
    row.touches++;
    if (responded(log.outcome)) row.responses++;
    byChannel.set(log.channel, row);
  }
  return [...byChannel.values()].sort((a, b) => b.touches - a.touches);
}

const meetingIndex = stages.indexOf('MEETING BOOKED');
export function segmentStats(companies: { id: string; segment: string; stage: string }[], logs: OutcomeLog[]): SegmentStats[] {
  const logsByCompany = new Map<string, OutcomeLog[]>();
  for (const log of logs) logsByCompany.set(log.companyId, [...(logsByCompany.get(log.companyId) ?? []), log]);
  const bySegment = new Map<string, SegmentStats>();
  for (const company of companies) {
    if (!company.segment) continue;
    const row = bySegment.get(company.segment) ?? { name: company.segment, leads: 0, contacted: 0, responded: 0, meetings: 0, won: 0 };
    const companyLogs = logsByCompany.get(company.id) ?? [];
    const stageIndex = stages.indexOf(company.stage as typeof stages[number]);
    row.leads++;
    if (companyLogs.length) row.contacted++;
    if (companyLogs.some(log => responded(log.outcome))) row.responded++;
    if (companyLogs.some(log => log.outcome === 'MEETING_BOOKED') || (company.stage !== 'LOST' && stageIndex >= meetingIndex)) row.meetings++;
    if (company.stage === 'WON') row.won++;
    bySegment.set(company.segment, row);
  }
  return [...bySegment.values()].sort((a, b) => b.won - a.won || b.meetings - a.meetings || b.leads - a.leads);
}

// Below these, results are noise: every group keeps the base search interval.
export const minContactedOverall = 10;
export const minContactedPerSegment = 3;

/**
 * Search-interval multiplier per segment: groups that respond, meet and close better are searched
 * more often (down to 0.5×), weak groups less often (up to 2×). Smoothed so one lucky win cannot swing it.
 */
export function segmentMultipliers(stats: SegmentStats[]) {
  const multipliers: Record<string, number> = {};
  const contactedOverall = stats.reduce((sum, row) => sum + row.contacted, 0);
  const eligible = stats.filter(row => row.contacted >= minContactedPerSegment);
  if (contactedOverall < minContactedOverall || eligible.length < 2) return multipliers;
  const rate = (row: SegmentStats) => (row.responded + 2 * row.meetings + 4 * row.won + 1) / (row.contacted + 2);
  const mean = eligible.reduce((sum, row) => sum + rate(row), 0) / eligible.length;
  for (const row of eligible) multipliers[row.name] = Math.round(Math.min(2, Math.max(0.5, mean / rate(row))) * 100) / 100;
  return multipliers;
}
