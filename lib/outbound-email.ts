import { createHash, randomBytes } from 'node:crypto';

export function outboundEmailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim() || '';
  const from = process.env.RESEND_FROM?.trim() || '';
  const postalAddress = process.env.EMAIL_POSTAL_ADDRESS?.trim() || '';
  const appOrigin = process.env.AUTH_URL?.trim() || '';
  let origin: URL | null = null;
  try {
    const parsed = new URL(appOrigin);
    if (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) origin = parsed;
  } catch { /* reported through configured below */ }
  const configured = Boolean(apiKey && from && postalAddress && origin && extractEmail(from));
  return { configured, from, postalAddress, origin, ...(configured ? { apiKey } : {}) };
}

export function extractEmail(from: string) {
  const match = from.match(/<([^<>\s]+@[^<>\s]+)>$/);
  const raw = match?.[1] || from;
  return zSafeEmail(raw);
}

export function zSafeEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

export function newUnsubscribeToken() {
  return randomBytes(32).toString('base64url');
}

export function hashUnsubscribeToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function resendEventStatus(eventType: string) {
  switch (eventType) {
    case 'email.sent': return 'SENT';
    case 'email.delivered': return 'DELIVERED';
    case 'email.delivery_delayed': return 'DELAYED';
    case 'email.bounced': return 'BOUNCED';
    case 'email.complained': return 'COMPLAINED';
    case 'email.failed': return 'FAILED';
    case 'email.suppressed': return 'SUPPRESSED';
    default: return null;
  }
}

export function shouldReplaceSendStatus(current: string, next: string) {
  const rank: Record<string, number> = { SENDING: 0, SENT: 1, DELAYED: 2, DELIVERED: 3, FAILED: 4, SUPPRESSED: 5, BOUNCED: 6, COMPLAINED: 7 };
  if (['SUPPRESSED', 'BOUNCED', 'COMPLAINED'].includes(current)) return false;
  if (['SUPPRESSED', 'BOUNCED', 'COMPLAINED'].includes(next)) return true;
  return (rank[next] ?? 0) >= (rank[current] ?? 0);
}

export function unsubscribeUrl(origin: URL, token: string) {
  const url = new URL('/api/outreach/unsubscribe', origin);
  url.searchParams.set('token', token);
  return url.toString();
}
