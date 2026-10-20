import { ApiError, apiError } from '@/lib/access';
import { isInternalRequest } from '@/lib/internal-auth';
import { sendMorningBriefs } from '@/lib/morning-brief';

// Scheduler tick: sends any morning briefs that are due.
export async function POST(request: Request) {
  try {
    if (!isInternalRequest(request)) throw new ApiError(401, 'Unauthorized');
    return Response.json(await sendMorningBriefs());
  } catch (error) { return apiError(error); }
}
