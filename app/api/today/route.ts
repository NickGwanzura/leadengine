import { apiError, requireMember } from '@/lib/access';
import { buildToday } from '@/lib/today';

export async function GET() {
  try {
    const member = await requireMember();
    return Response.json(await buildToday(member.organizationId), { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}
