import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { readSegments } from '@/lib/business-profile';

const openStages = ['CONTACTED', 'MEETING BOOKED', 'DISCOVERY COMPLETED', 'PROPOSAL SENT', 'NEGOTIATION'];
const quietDays = 14;
const companySelect = {
  id: true, name: true, domain: true, website: true, industry: true, city: true, stage: true, phone: true, email: true, contactPerson: true, segment: true,
  score: { select: { total: true, override: true } },
  _count: { select: { activities: { where: { type: 'TOUCH' } } } },
  // The first observed website gap becomes the opening line of the message.
  audits: { orderBy: { createdAt: 'desc' }, take: 1, select: { findings: { where: { classification: 'POTENTIAL ISSUE' }, take: 1, select: { observation: true } } } },
} satisfies Prisma.ProspectCompanySelect;
type CompanyRow = Prisma.ProspectCompanyGetPayload<{ select: typeof companySelect }>;

type Pitch = { service: string; painPoint: string };
function present(company: CompanyRow, pitches: Map<string, Pitch>) {
  const { score, _count, audits, ...rest } = company;
  return { company: rest, score: score ? score.override ?? score.total : null, touches: _count.activities, hook: audits[0]?.findings[0]?.observation ?? null, pitch: pitches.get(company.segment) ?? null };
}
const byScore = (a: { score: number | null }, b: { score: number | null }) => (b.score ?? -1) - (a.score ?? -1);

// Who to contact now: due follow-ups first, then the best uncontacted leads, then deals that went quiet.
export async function buildToday(organizationId: string) {
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const quietSince = new Date(Date.now() - quietDays * 86400000);
  const [tasks, fresh, quiet, profile] = await Promise.all([
    db.followUpTask.findMany({ where: { organizationId, status: 'OPEN', dueAt: { lte: endOfDay }, companyId: { not: null } }, orderBy: { dueAt: 'asc' }, take: 50, select: { id: true, title: true, type: true, dueAt: true, company: { select: companySelect } } }),
    db.prospectCompany.findMany({ where: { organizationId, stage: { in: ['NEW LEAD', 'RESEARCHED', 'QUALIFIED'] }, activities: { none: { type: 'TOUCH' } }, followUpTasks: { none: { status: 'OPEN' } } }, orderBy: { createdAt: 'desc' }, take: 60, select: companySelect }),
    db.prospectCompany.findMany({ where: { organizationId, stage: { in: openStages }, followUpTasks: { none: { status: 'OPEN' } }, activities: { none: { createdAt: { gte: quietSince } } } }, orderBy: { updatedAt: 'asc' }, take: 10, select: companySelect }),
    db.businessProfile.findUnique({ where: { organizationId }, select: { segments: true } }),
  ]);
  // Each target group's matching service and problem, from the lead engine profile, tailors the opener.
  const pitches = new Map(readSegments(profile?.segments).filter(segment => segment.service).map(segment => [segment.name, { service: segment.service, painPoint: segment.painPoint }]));
  const due = tasks.flatMap(task => task.company ? [{ kind: 'due' as const, reason: task.dueAt < new Date() ? `Overdue: ${task.title}` : `Due today: ${task.title}`, task: { id: task.id, title: task.title, type: task.type, dueAt: task.dueAt }, ...present(task.company, pitches) }] : []);
  const newLeads = fresh.map(company => ({ kind: 'new' as const, reason: 'New lead, not contacted yet', task: null, ...present(company, pitches) })).sort(byScore).slice(0, 12);
  const goneQuiet = quiet.map(company => ({ kind: 'quiet' as const, reason: `No contact for ${quietDays}+ days in ${company.stage.toLowerCase()}`, task: null, ...present(company, pitches) })).sort(byScore);
  return { due, newLeads, goneQuiet };
}

export type TodayList = Awaited<ReturnType<typeof buildToday>>;
