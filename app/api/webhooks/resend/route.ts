import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { resendEventStatus, shouldReplaceSendStatus } from '@/lib/outbound-email';

export const runtime = 'nodejs';

function validSignature(rawBody: string, request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signatures = request.headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  const timestampNumber = Number(timestamp);
  // Resend retries failed webhook deliveries. Unique Svix event IDs below make replay processing idempotent.
  if (!Number.isSafeInteger(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 86_400) return false;
  const encodedSecret = secret.replace(/^whsec_/, '');
  let key: Buffer;
  try { key = Buffer.from(encodedSecret, 'base64'); } catch { return false; }
  if (!key.length) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return signatures.split(' ').some(signature => {
    const [version, value] = signature.split(',', 2);
    if (version !== 'v1' || !value) return false;
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(value);
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request)) return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  const providerEventId = request.headers.get('svix-id')!;
  let payload: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; tags?: unknown; to?: unknown; bounce?: { type?: unknown } } };
  try { payload = JSON.parse(rawBody); } catch { return Response.json({ error: 'Invalid event payload' }, { status: 400 }); }
  if (typeof payload.type !== 'string' || !payload.type.startsWith('email.')) return Response.json({ received: true });
  if (!resendEventStatus(payload.type)) return Response.json({ received: true, ignored: true });
  const providerMessageId = typeof payload.data?.email_id === 'string' ? payload.data.email_id : '';
  if (!providerMessageId) return Response.json({ error: 'Email event is missing its provider email ID' }, { status: 400 });
  const tags = payload.data?.tags;
  const taggedSendId = Array.isArray(tags)
    ? (tags.find(tag => tag && typeof tag === 'object' && 'name' in tag && tag.name === 'leados_send_id' && 'value' in tag)?.value as string | undefined)
    : tags && typeof tags === 'object' && 'leados_send_id' in tags && typeof tags.leados_send_id === 'string' ? tags.leados_send_id : undefined;
  const sendByProviderId = await db.outreachSend.findUnique({ where: { providerMessageId } });
  const send = sendByProviderId || (taggedSendId ? await db.outreachSend.findUnique({ where: { id: taggedSendId } }) : null);
  const eventStatus = resendEventStatus(payload.type);
  const occurredAt = typeof payload.created_at === 'string' && Number.isFinite(Date.parse(payload.created_at)) ? new Date(payload.created_at) : null;
  try {
    await db.$transaction(async tx => {
      await tx.outreachEmailEvent.create({ data: { providerEventId, providerMessageId, eventType: payload.type as string, occurredAt, sendId: send?.id || null } });
      if (!send) return;
      const current = await tx.outreachSend.findUniqueOrThrow({ where: { id: send.id }, select: { status: true, providerMessageId: true } });
      if (!current.providerMessageId) await tx.outreachSend.update({ where: { id: send.id }, data: { providerMessageId, sentAt: occurredAt || new Date() } });
      if (eventStatus && shouldReplaceSendStatus(current.status, eventStatus)) {
        await tx.outreachSend.update({ where: { id: send.id }, data: { status: eventStatus, error: null } });
      }
      if (['email.bounced', 'email.complained', 'email.suppressed'].includes(payload.type as string)) {
        await tx.emailSuppression.upsert({
          where: { organizationId_email: { organizationId: send.organizationId, email: send.recipientEmail } },
          create: { organizationId: send.organizationId, email: send.recipientEmail, reason: payload.type === 'email.bounced' ? 'BOUNCE' : payload.type === 'email.suppressed' ? 'PROVIDER_SUPPRESSION' : 'COMPLAINT', source: 'RESEND_WEBHOOK' },
          update: {},
        });
      }
      await tx.auditLog.create({ data: { organizationId: send.organizationId, userId: send.createdBy, action: `OUTBOUND_${payload.type.toUpperCase().replaceAll('.', '_')}`, entityId: send.id, detail: { providerMessageId, occurredAt: occurredAt?.toISOString() || null } } });
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return Response.json({ received: true, duplicate: true });
    throw error;
  }
  return Response.json({ received: true });
}
