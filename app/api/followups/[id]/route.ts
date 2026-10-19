import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';
import { recalculateCompanyScore } from '@/lib/score-service';

const updateInput = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  dueAt: z.iso.datetime().optional(),
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
}).refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const parsed = updateInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Invalid follow-up update');
    const { id } = await params;
    const current = await db.followUpTask.findFirst({ where: { id, organizationId: member.organizationId } });
    if (!current) throw new ApiError(404, 'Follow-up task not found');
    const { dueAt, status, ...fields } = parsed.data;
    const nextStatus = status ?? current.status;
    const task = await db.$transaction(async tx => {
      const updated = await tx.followUpTask.update({
        where: { id },
        data: {
          ...fields,
          ...(dueAt ? { dueAt: new Date(dueAt) } : {}),
          ...(status ? { status, completedAt: status === 'COMPLETED' ? new Date() : null } : {}),
        },
      });
      if (updated.companyId) await recalculateCompanyScore(tx, updated.companyId);
      await tx.auditLog.create({ data: {
        organizationId: member.organizationId,
        userId: member.userId,
        action: `FOLLOWUP_${nextStatus}`,
        entityId: id,
        detail: { changed: Object.keys(parsed.data), previousStatus: current.status, dueAt: updated.dueAt.toISOString() },
      } });
      return updated;
    });
    return Response.json({ task });
  } catch (error) { return apiError(error); }
}
