import { db } from '@/lib/db';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';
import { proposalInput, proposalTotalCents } from '@/lib/proposals';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const { id } = await params;
    const parsed = proposalInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
    const [existing, company] = await Promise.all([
      db.proposal.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true, status: true } }),
      db.prospectCompany.findFirst({ where: { id: parsed.data.companyId, organizationId: member.organizationId }, select: { id: true } }),
    ]);
    if (!existing) throw new ApiError(404, 'Proposal not found');
    if (existing.status !== 'DRAFT') throw new ApiError(409, 'Only drafts can be edited');
    if (!company) throw new ApiError(404, 'Company not found');
    const { items, ...fields } = parsed.data;
    await db.$transaction(async tx => {
      await tx.proposalLineItem.deleteMany({ where: { proposalId: id } });
      await tx.proposal.update({ where: { id }, data: { ...fields, items: { create: items.map((item, sortOrder) => ({ ...item, sortOrder })) } } });
      await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'PROPOSAL_DRAFT_UPDATED', entityId: id, detail: { companyId: company.id, totalCents: proposalTotalCents(items) } } });
    });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
