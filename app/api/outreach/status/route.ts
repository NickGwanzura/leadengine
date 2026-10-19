import { apiError, requireMember } from '@/lib/access';
import { outboundEmailConfiguration } from '@/lib/outbound-email';

export async function GET() {
  try {
    await requireMember();
    const config = outboundEmailConfiguration();
    return Response.json({
      configured: config.configured && Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      sender: config.from || null,
      webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      postalAddressConfigured: Boolean(config.postalAddress),
    });
  } catch (error) { return apiError(error); }
}
