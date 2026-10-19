import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, ApiError, requireMember, sameOrigin } from '@/lib/access';
import { extractEmail, hashUnsubscribeToken, newUnsubscribeToken, outboundEmailConfiguration, resendEventStatus, shouldReplaceSendStatus, unsubscribeUrl, zSafeEmail } from '@/lib/outbound-email';

const sendInput = z.object({ draftId: z.string().min(1), recipientEmail: z.string().email().max(254), requestKey: z.string().uuid(), confirmSend: z.literal(true) });

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await requireMember(true);
    const parsed = sendInput.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Review the recipient and message, then confirm the send');
    const config = outboundEmailConfiguration();
    if (!config.configured || !config.apiKey || !config.origin) throw new ApiError(503, 'Outbound email is not configured. Ask an administrator to configure the sender, Resend API key and postal address.');
    if (!process.env.RESEND_WEBHOOK_SECRET?.trim()) throw new ApiError(503, 'Email sending is disabled until delivery event webhooks are configured.');

    const recipientEmail = zSafeEmail(parsed.data.recipientEmail);
    if (!recipientEmail) throw new ApiError(400, 'Enter a valid recipient email address');
    if (extractEmail(config.from) === recipientEmail) throw new ApiError(400, 'Choose a recipient other than the sender address');

    const draft = await db.outreachDraft.findFirst({
      where: { id: parsed.data.draftId, organizationId: member.organizationId, channel: { in: ['COLD_EMAIL', 'FOLLOWUP_EMAIL'] } },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!draft) throw new ApiError(404, 'Email draft not found in this workspace');
    if (!draft.subject?.trim() || !draft.body.trim()) throw new ApiError(400, 'Add a subject and message before sending');
    const suppression = await db.emailSuppression.findUnique({ where: { organizationId_email: { organizationId: member.organizationId, email: recipientEmail } }, select: { reason: true } });
    if (suppression) throw new ApiError(409, `This address is suppressed (${suppression.reason.toLowerCase().replaceAll('_', ' ')}). It cannot receive another email.`);

    let send = await db.outreachSend.findUnique({ where: { organizationId_requestKey: { organizationId: member.organizationId, requestKey: parsed.data.requestKey } } });
    if (send && (send.draftId !== draft.id || send.recipientEmail !== recipientEmail)) throw new ApiError(409, 'This send confirmation was already used for a different recipient or draft');
    if (send && send.providerMessageId && send.status !== 'FAILED') return Response.json({ send, alreadySent: true });
    const pending = await db.outreachSend.findFirst({ where: { organizationId: member.organizationId, draftId: draft.id, recipientEmail, status: { in: ['SENDING', 'UNKNOWN'] } }, select: { id: true, status: true } });
    if (pending) throw new ApiError(409, pending.status === 'UNKNOWN' ? 'A previous send has an uncertain provider response. Check Resend before trying again.' : 'This message is already being sent. Refresh the history before retrying.');

    if (!send) {
      const token = newUnsubscribeToken();
      try {
        send = await db.$transaction(async tx => {
          const created = await tx.outreachSend.create({
            data: {
              organizationId: member.organizationId, draftId: draft.id, companyId: draft.companyId, createdBy: member.userId,
              recipientEmail, senderEmail: config.from, subject: draft.subject!.trim(), body: draft.body.trim(), requestKey: parsed.data.requestKey,
            },
          });
          await tx.outreachUnsubscribeToken.create({ data: { sendId: created.id, tokenHash: hashUnsubscribeToken(token) } });
          await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'OUTBOUND_EMAIL_SEND_REQUESTED', entityId: created.id, detail: { draftId: draft.id, companyId: draft.companyId, recipientEmail, provider: 'resend' } } });
          return created;
        });
        (send as typeof send & { unsubscribeValue?: string }).unsubscribeValue = token;
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error;
        send = await db.outreachSend.findUnique({ where: { organizationId_requestKey: { organizationId: member.organizationId, requestKey: parsed.data.requestKey } } });
        if (!send) throw error;
        if (send.draftId !== draft.id || send.recipientEmail !== recipientEmail) throw new ApiError(409, 'This send confirmation was already used for a different recipient or draft');
        if (send.providerMessageId && send.status !== 'FAILED') return Response.json({ send, alreadySent: true });
      }
    }

    const tokenRecord = await db.outreachUnsubscribeToken.findUnique({ where: { sendId: send.id } });
    if (!tokenRecord) throw new ApiError(500, 'Unsubscribe protection could not be prepared. No email was sent.');
    const rawToken = (send as typeof send & { unsubscribeValue?: string }).unsubscribeValue;
    const unsubscribe = rawToken ? unsubscribeUrl(config.origin, rawToken) : null;
    if (!unsubscribe) throw new ApiError(409, 'This send is already in progress. Refresh the draft history before retrying.');

    const textBody = `${send.body}\n\n—\nSpiritus Systems\n${config.postalAddress}\n\nIf you do not want further marketing email from us, you can unsubscribe here:\n${unsubscribe}`;
    let providerResponse: Response;
    try {
      providerResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json', 'idempotency-key': `${member.organizationId}/${send.id}` },
        body: JSON.stringify({
          from: send.senderEmail, to: [send.recipientEmail], subject: send.subject, text: textBody,
          headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          tags: [{ name: 'leados_send_id', value: send.id }],
        }),
      });
    } catch {
      await db.outreachSend.update({ where: { id: send.id }, data: { status: 'UNKNOWN', error: 'Provider response was uncertain; check Resend before retrying.' } });
      return Response.json({ error: 'The provider response was not received. Check Resend before retrying to avoid a duplicate.', sendId: send.id }, { status: 502 });
    }
    const providerBody = await providerResponse.json().catch(() => null) as { id?: string } | null;
    if (!providerResponse.ok || !providerBody?.id) {
      await db.outreachSend.update({ where: { id: send.id }, data: { status: 'FAILED', error: 'Resend rejected the email. Review the sender setup and recipient.' } });
      return Response.json({ error: 'Resend rejected the email. Review the sender setup and recipient, then try again.' }, { status: providerResponse.status === 429 ? 429 : 502 });
    }
    const beforeReconcile = await db.outreachSend.findUniqueOrThrow({ where: { id: send.id }, select: { status: true, sentAt: true } });
    const acceptedStatus = shouldReplaceSendStatus(beforeReconcile.status, 'SENT') ? 'SENT' : beforeReconcile.status;
    await db.outreachSend.update({ where: { id: send.id }, data: { providerMessageId: providerBody.id, status: acceptedStatus, error: null, sentAt: beforeReconcile.sentAt || new Date() } });
    const events = await db.outreachEmailEvent.findMany({ where: { providerMessageId: providerBody.id }, orderBy: { receivedAt: 'asc' } });
    const statusFromEvents = events.reduce((current, event) => {
      const next = resendEventStatus(event.eventType);
      return next && shouldReplaceSendStatus(current, next) ? next : current;
    }, 'SENT');
    const updated = await db.$transaction(async tx => {
      const current = await tx.outreachSend.findUniqueOrThrow({ where: { id: send.id }, select: { status: true } });
      const resultingStatus = shouldReplaceSendStatus(current.status, statusFromEvents) ? statusFromEvents : current.status;
      const saved = await tx.outreachSend.update({ where: { id: send.id }, data: { providerMessageId: providerBody.id, status: resultingStatus, error: null, sentAt: send.sentAt || new Date() } });
      if (events.length) await tx.outreachEmailEvent.updateMany({ where: { providerMessageId: providerBody.id, sendId: null }, data: { sendId: send.id } });
      if (['SUPPRESSED', 'BOUNCED', 'COMPLAINED'].includes(resultingStatus)) {
        await tx.emailSuppression.upsert({
          where: { organizationId_email: { organizationId: member.organizationId, email: recipientEmail } },
          create: { organizationId: member.organizationId, email: recipientEmail, reason: resultingStatus === 'BOUNCED' ? 'BOUNCE' : resultingStatus === 'SUPPRESSED' ? 'PROVIDER_SUPPRESSION' : 'COMPLAINT', source: 'RESEND_WEBHOOK' },
          update: {},
        });
      }
      await tx.auditLog.create({ data: { organizationId: member.organizationId, userId: member.userId, action: 'OUTBOUND_EMAIL_ACCEPTED', entityId: send.id, detail: { providerMessageId: providerBody.id, recipientEmail, status: resultingStatus } } });
      return saved;
    });
    return Response.json({ send: updated }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const draftId = new URL(request.url).searchParams.get('draftId');
    const sends = await db.outreachSend.findMany({
      where: { organizationId: member.organizationId, ...(draftId ? { draftId } : {}) },
      select: { id: true, draftId: true, recipientEmail: true, senderEmail: true, subject: true, status: true, error: true, sentAt: true, createdAt: true, events: { select: { eventType: true, occurredAt: true }, orderBy: { receivedAt: 'desc' }, take: 6 } },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    return Response.json({ sends });
  } catch (error) { return apiError(error); }
}
