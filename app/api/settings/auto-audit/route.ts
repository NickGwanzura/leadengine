import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { queueAutomaticAudits } from '@/lib/crawl-queue';

export async function GET() {
  try {
    const member = await requireMember();
    const organization = await db.organization.findUniqueOrThrow({ where: { id: member.organizationId }, select: { autoAuditBy: true, autoAuditAt: true } });
    const approver = organization.autoAuditBy ? await db.user.findUnique({ where: { id: organization.autoAuditBy }, select: { name: true } }) : null;
    const pending = await db.prospectCompany.count({ where: { organizationId: member.organizationId, website: { not: null }, stage: { notIn: ['WON', 'LOST'] }, jobs: { none: {} } } });
    return Response.json({ enabled: Boolean(organization.autoAuditBy), enabledBy: approver?.name ?? null, enabledAt: organization.autoAuditAt, pending });
  } catch (error) { return apiError(error); }
}

// Turning auto-audit on records the member as the accountable approver for every automatic crawl.
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const input = z.object({ enabled: z.boolean(), authorized: z.boolean().optional() }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, 'Choose whether automatic audits are on');
    if (input.data.enabled && input.data.authorized !== true) throw new ApiError(400, 'Confirm you are authorised to approve automatic public website audits');
    await db.organization.update({ where: { id: member.organizationId }, data: input.data.enabled ? { autoAuditBy: member.userId, autoAuditAt: new Date() } : { autoAuditBy: null, autoAuditAt: null } });
    await db.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: input.data.enabled ? 'AUTO_AUDIT_ENABLED' : 'AUTO_AUDIT_DISABLED', entityId: member.organizationId, detail: {} } });
    const started = input.data.enabled ? await queueAutomaticAudits(member.organizationId, 10) : { queued: 0 };
    return Response.json({ enabled: input.data.enabled, queued: started.queued });
  } catch (error) { return apiError(error); }
}
