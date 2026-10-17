import { z } from 'zod';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';
import { searchPublicBusinesses } from '@/lib/discovery-search';

const inputSchema = z.object({
  industry: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(100),
  keywords: z.string().trim().max(200).default(''),
  service: z.string().trim().max(100).default(''),
  size: z.string().trim().max(100).default(''),
  limit: z.number().int().min(1).max(12).default(6),
});

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await requireMember(true);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Enter an industry, location and a result limit of 1 to 12');
    const result = await searchPublicBusinesses(parsed.data);
    return Response.json({ candidates: result, searchedAt: new Date().toISOString() });
  } catch (error) { return apiError(error); }
}
