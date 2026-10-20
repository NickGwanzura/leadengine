import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, apiError, requireMember, sameOrigin } from '@/lib/access';
import { aiConfiguration } from '@/lib/ai-provider';
import { analyseBusinessWebsite, maxSegments, readSegments, readServices, segmentSchema } from '@/lib/business-profile';
import { websiteField } from '@/lib/validation';

function present(profile: Awaited<ReturnType<typeof db.businessProfile.findUnique>>) {
  return profile && { ...profile, services: readServices(profile.services), segments: readSegments(profile.segments) };
}

export async function GET() {
  try {
    const member = await requireMember();
    const profile = await db.businessProfile.findUnique({ where: { organizationId: member.organizationId } });
    return Response.json({ profile: present(profile), aiConfigured: aiConfiguration().configured }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}

// Reads the business's own website and replaces the search plan with the segments found there.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const input = z.object({ website: websiteField }).safeParse(await request.json());
    if (!input.success || !input.data.website) throw new ApiError(400, 'Enter your business website, for example spiritus.co.zw');
    if (!aiConfiguration().configured) throw new ApiError(503, 'Website analysis needs AI_API_KEY configured in the app container');
    const organizationId = member.organizationId;
    const website = input.data.website;
    await db.businessProfile.upsert({ where: { organizationId }, create: { organizationId, website, status: 'ANALYSING' }, update: { website, status: 'ANALYSING', error: null } });
    try {
      const analysed = await analyseBusinessWebsite(website);
      const profile = await db.businessProfile.update({ where: { organizationId }, data: { ...analysed, status: 'READY', error: null, analysedAt: new Date() } });
      await db.auditLog.create({ data: { organizationId, userId: member.userId, action: 'BUSINESS_PROFILE_ANALYSED', entityId: profile.id, detail: { website, segments: analysed.segments.length } } });
      return Response.json({ profile: present(profile) });
    } catch (cause) {
      const message = cause instanceof Error && !cause.message.startsWith('AI_') ? cause.message : 'The AI provider could not analyse the website. Try again shortly.';
      await db.businessProfile.update({ where: { organizationId }, data: { status: 'FAILED', error: message.slice(0, 300) } });
      throw new ApiError(502, `Could not analyse ${website}: ${message}`);
    }
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const input = z.object({ active: z.boolean().optional(), segments: z.array(segmentSchema).min(1).max(maxSegments).optional() }).safeParse(await request.json());
    if (!input.success) throw new ApiError(400, input.error.issues[0]?.message || 'Invalid search plan');
    const names = input.data.segments?.map(segment => segment.name.toLowerCase()) || [];
    if (new Set(names).size !== names.length) throw new ApiError(400, 'Each target segment needs a different name');
    const existing = await db.businessProfile.findUnique({ where: { organizationId: member.organizationId } });
    if (!existing) throw new ApiError(404, 'Analyse your website first');
    const profile = await db.businessProfile.update({ where: { organizationId: member.organizationId }, data: { ...(input.data.active !== undefined ? { active: input.data.active } : {}), ...(input.data.segments ? { segments: input.data.segments } : {}) } });
    return Response.json({ profile: present(profile) });
  } catch (error) { return apiError(error); }
}
