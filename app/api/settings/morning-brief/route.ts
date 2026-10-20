import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { briefConfigured } from '@/lib/morning-brief';

export async function GET() {
  try {
    const member = await requireMember();
    return Response.json({ enabled: member.morningBrief, configured: briefConfigured() });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const input = z.object({ enabled: z.boolean() }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, 'Choose whether to receive the morning brief');
    if (input.data.enabled && !briefConfigured()) throw new ApiError(503, 'The morning brief needs outbound email (Resend) configured on the server');
    await db.organizationMember.update({ where: { id: member.id }, data: { morningBrief: input.data.enabled } });
    return Response.json({ enabled: input.data.enabled, configured: true });
  } catch (error) { return apiError(error); }
}
