import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';

const priceInput = z.object({
  id: z.string().min(1),
  price: z.number().min(0).max(100000000).refine(value => Number.isInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use no more than two decimal places'),
  fromPrice: z.boolean(),
});

export async function GET() {
  try {
    const member = await requireMember();
    const packages = await db.productPackage.findMany({ where: { organizationId: member.organizationId }, orderBy: { price: 'asc' } });
    return Response.json({ packages: packages.map(pkg => ({ id: pkg.id, name: pkg.name, price: Number(pkg.price), fromPrice: pkg.fromPrice, currency: pkg.currency })) });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    if (member.role !== 'ADMIN') throw new ApiError(403, 'Administrator access required');
    const parsed = priceInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
    const current = await db.productPackage.findFirst({ where: { id: parsed.data.id, organizationId: member.organizationId } });
    if (!current) throw new ApiError(404, 'Package not found');
    const { id, price, fromPrice } = parsed.data;
    await db.$transaction(async tx => {
      await tx.productPackage.update({ where: { id }, data: { price, fromPrice } });
      await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'PACKAGE_PRICE_UPDATED', entityId: id, detail: { name: current.name, oldPrice: Number(current.price), newPrice: price, oldFromPrice: current.fromPrice, newFromPrice: fromPrice } } });
    });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
