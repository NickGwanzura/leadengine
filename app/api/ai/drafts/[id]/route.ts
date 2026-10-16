import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';

const updateInput = z.object({ subject: z.string().trim().max(200).nullable(), body: z.string().trim().min(1).max(10000) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const parsed = updateInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Draft needs a message body under 10,000 characters');
    const { id } = await params;
    const draft = await db.outreachDraft.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
    if (!draft) throw new ApiError(404, 'Draft not found in this workspace');
    const updated = await db.$transaction(async tx => {
      const result = await tx.outreachDraft.update({ where: { id }, data: parsed.data });
      await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'OUTREACH_DRAFT_EDITED', entityId: id, detail: { edited: true } } });
      return result;
    });
    return Response.json({ draft: updated });
  } catch (error) { return apiError(error); }
}
