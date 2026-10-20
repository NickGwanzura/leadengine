import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { recalculateCompanyScore } from '@/lib/score-service';
import { channels, outcomePlan, outcomes } from '@/lib/sales-cadence';

const input = z.object({ outcome: z.enum(outcomes), channel: z.enum(channels), note: z.string().trim().max(2000).optional() });

// Logs one contact attempt and applies the follow-up cadence: stage moves forward, open follow-ups
// close, and the next touch is scheduled.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const { id } = await params;
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Choose an outcome and channel');
    const result = await db.$transaction(async tx => {
      const company = await tx.prospectCompany.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true, stage: true } });
      if (!company) throw new ApiError(404, 'Company not found');
      const touches = await tx.dealActivity.count({ where: { companyId: id, type: 'TOUCH' } });
      const plan = outcomePlan(parsed.data.outcome, parsed.data.channel, touches, company.stage);
      await tx.dealActivity.create({ data: { companyId: id, userId: member.userId, type: 'TOUCH', body: parsed.data.note ? `${plan.activity}\n${parsed.data.note}` : plan.activity } });
      if (plan.closeOpenTasks) await tx.followUpTask.updateMany({ where: { companyId: id, status: 'OPEN' }, data: { status: 'COMPLETED', completedAt: new Date() } });
      const followUpAt = plan.followUp ? new Date(Date.now() + plan.followUp.days * 86400000) : null;
      if (plan.followUp) await tx.followUpTask.create({ data: { organizationId: member.organizationId, companyId: id, createdBy: member.userId, assignedTo: member.userId, title: plan.followUp.title, type: plan.followUp.type, dueAt: followUpAt! } });
      // Tasks now carry the schedule, so the legacy single follow-up date is cleared to avoid double reminders.
      await tx.prospectCompany.update({ where: { id }, data: { stage: plan.stage, nextFollowUp: null } });
      await recalculateCompanyScore(tx, id);
      await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'OUTCOME_LOGGED', entityId: id, detail: { outcome: parsed.data.outcome, channel: parsed.data.channel, from: company.stage, to: plan.stage } } });
      return { stage: plan.stage, summary: plan.summary, followUpAt };
    });
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
