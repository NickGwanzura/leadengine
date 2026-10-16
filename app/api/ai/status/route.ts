import { requireMember, apiError } from '@/lib/access';
import { publicAiStatus } from '@/lib/ai-provider';

export async function GET() {
  try {
    await requireMember();
    return Response.json(publicAiStatus());
  } catch (error) { return apiError(error); }
}
