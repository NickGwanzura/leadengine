import { db } from '@/lib/db';
import { hashUnsubscribeToken, zSafeEmail } from '@/lib/outbound-email';

export const runtime = 'nodejs';

const page = (title: string, content: string, status = 200) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#182235"><main><h1 style="font-size:24px">${title}</h1>${content}</main></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });

async function lookup(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const record = await db.outreachUnsubscribeToken.findUnique({ where: { tokenHash: hashUnsubscribeToken(token) }, include: { send: { select: { id: true, organizationId: true, recipientEmail: true, createdBy: true } } } });
  if (!record || !zSafeEmail(record.send.recipientEmail)) return null;
  return record;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const record = await lookup(token);
  if (!record) return page('Link unavailable', '<p>This unsubscribe link is invalid. If you still receive email from us, reply to the message and ask us to stop.</p>', 404);
  if (record.usedAt) return page('You are unsubscribed', '<p>This address has already been removed from future marketing email.</p>');
  const action = `/api/outreach/unsubscribe?token=${encodeURIComponent(token)}`;
  return page('Confirm unsubscribe', `<p>Confirm that you want this email address removed from future marketing email.</p><form method="post" action="${action}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit" style="padding:11px 16px;border:0;border-radius:6px;background:#315fbd;color:white;font-size:15px;cursor:pointer">Unsubscribe</button></form>`);
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const record = await lookup(token);
  if (!record) return page('Link unavailable', '<p>This unsubscribe link is invalid. If you still receive email from us, reply to the message and ask us to stop.</p>', 404);
  if (record.usedAt) return page('You are unsubscribed', '<p>This address has already been removed from future marketing email.</p>');
  if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
    const form = new URLSearchParams(await request.text());
    if (form.get('List-Unsubscribe') !== 'One-Click') return page('Could not unsubscribe', '<p>Use the button on the unsubscribe page to confirm your request.</p>', 400);
  }
  const email = zSafeEmail(record.send.recipientEmail)!;
  await db.$transaction(async tx => {
    await tx.emailSuppression.upsert({
      where: { organizationId_email: { organizationId: record.send.organizationId, email } },
      create: { organizationId: record.send.organizationId, email, reason: 'OPT_OUT', source: 'UNSUBSCRIBE_LINK' },
      update: {},
    });
    await tx.outreachUnsubscribeToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId: record.send.organizationId, userId: record.send.createdBy, action: 'OUTBOUND_EMAIL_UNSUBSCRIBED', entityId: record.send.id, detail: { source: 'UNSUBSCRIBE_LINK' } } });
  });
  return page('You are unsubscribed', '<p>This address has been removed from future marketing email. You may close this page.</p>');
}
