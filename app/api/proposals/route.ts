import { db } from '@/lib/db';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';
import { proposalInput, proposalTotalCents } from '@/lib/proposals';

export async function GET() {
  try {
    const member = await requireMember();
    const [proposals, packages] = await Promise.all([
      db.proposal.findMany({ where: { organizationId: member.organizationId }, include: { company: { select: { id: true, name: true } }, items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
      db.productPackage.findMany({ where: { organizationId: member.organizationId }, orderBy: { price: 'asc' } }),
    ]);
    return Response.json({
      proposals: proposals.map(proposal => ({ ...proposal, items: proposal.items.map(item => ({ ...item, unitPrice: Number(item.unitPrice) })), total: proposalTotalCents(proposal.items.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: Number(item.unitPrice) }))) / 100 })),
      packages: packages.map(pkg => ({ id: pkg.id, name: pkg.name, price: Number(pkg.price), fromPrice: pkg.fromPrice, currency: pkg.currency })),
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const parsed = proposalInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
    const company = await db.prospectCompany.findFirst({ where: { id: parsed.data.companyId, organizationId: member.organizationId }, select: { id: true } });
    if (!company) throw new ApiError(404, 'Company not found');
    const { items, ...fields } = parsed.data;
    const proposal = await db.$transaction(async tx => {
      const created = await tx.proposal.create({ data: { ...fields, organizationId: member.organizationId, createdBy: member.userId, items: { create: items.map((item, sortOrder) => ({ ...item, sortOrder })) } } });
      await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'PROPOSAL_DRAFT_CREATED', entityId: created.id, detail: { companyId: company.id, totalCents: proposalTotalCents(items) } } });
      return created;
    });
    return Response.json({ id: proposal.id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
