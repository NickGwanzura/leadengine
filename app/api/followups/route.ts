import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';
import { recalculateCompanyScore } from '@/lib/score-service';

const createInput = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).default(''),
  type: z.enum(['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'PROPOSAL', 'GENERAL']).default('GENERAL'),
  dueAt: z.iso.datetime(),
  companyId: z.string().min(1).nullable().optional(),
  assignedTo: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const includeCompleted = new URL(request.url).searchParams.get('completed') === 'true';
    const tasks = await db.followUpTask.findMany({
      where: {
        organizationId: member.organizationId,
        ...(includeCompleted ? { status: { in: ['OPEN', 'COMPLETED', 'CANCELLED'] } } : { status: 'OPEN' }),
      },
      include: { company: { select: { id: true, name: true, stage: true } }, assignee: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 250,
    });
    return Response.json({ tasks });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const parsed = createInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Add a task title and valid due date');
    const input = parsed.data;
    if (input.companyId && !await db.prospectCompany.findFirst({ where: { id: input.companyId, organizationId: member.organizationId }, select: { id: true } })) {
      throw new ApiError(404, 'Company not found in this workspace');
    }
    const assignedTo = input.assignedTo || member.userId;
    if (!await db.organizationMember.findFirst({ where: { organizationId: member.organizationId, userId: assignedTo }, select: { id: true } })) {
      throw new ApiError(400, 'Assignee must be a member of this workspace');
    }
    const task = await db.$transaction(async tx => {
      const created = await tx.followUpTask.create({ data: {
        organizationId: member.organizationId,
        companyId: input.companyId ?? null,
        createdBy: member.userId,
        assignedTo,
        title: input.title,
        description: input.description,
        type: input.type,
        dueAt: new Date(input.dueAt),
      } });
      if (created.companyId) await recalculateCompanyScore(tx, created.companyId);
      await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'FOLLOWUP_CREATED', entityId: created.id, detail: { companyId: created.companyId, type: created.type } } });
      return created;
    });
    return Response.json({ task }, { status: 201 });
  } catch (error) { return apiError(error); }
}
