import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { refreshHours } from '@/lib/business-profile';
import { buildScorecard } from '@/lib/scorecard';
import { minContactedOverall, minContactedPerSegment } from '@/lib/sales-insights';

export async function GET() {
  try {
    const member = await requireMember();
    return Response.json({ ...await buildScorecard(member.organizationId), refreshHours, minContactedOverall, minContactedPerSegment }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const input = z.object({ weeklyTouchTarget: z.number().int().min(1).max(1000) }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, 'Weekly target must be a whole number from 1 to 1000');
    await db.organization.update({ where: { id: member.organizationId }, data: input.data });
    return Response.json(input.data);
  } catch (error) { return apiError(error); }
}
