import { fetchPublicHtml } from '@/lib/business-profile';
import { validatePublicUrl } from '@/lib/url-security';

export type Signal = { label: string; kind: 'contact' | 'gap' | 'risk' };
export type Precheck = { rank: number; signals: Signal[] };

/** Minimal robots.txt check for the homepage: longest matching Allow/Disallow rule in the `*` group wins. */
export function robotsAllowsHome(robots: string, path = '/') {
  let applies = false, inAgents = false, best = { length: -1, allow: true };
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [key, ...rest] = line.split(':');
    const field = key?.trim().toLowerCase(), value = rest.join(':').trim();
    if (field === 'user-agent') { if (!inAgents) applies = false; inAgents = true; if (value === '*') applies = true; continue; }
    inAgents = false;
    if (!applies || (field !== 'allow' && field !== 'disallow')) continue;
    if (field === 'disallow' && !value) continue;
    if (path.startsWith(value) && value.length > best.length) best = { length: value.length, allow: field === 'allow' };
  }
  return best.allow;
}

/**
 * Ranks a sourced lead from its public homepage. Contact routes make a lead workable;
 * visible website gaps are what a website/systems offer can fix. Every point is shown as a signal.
 */
export function scoreHomepage(html: string, url: string, now = new Date()): Precheck {
  const signals: Signal[] = [];
  const lower = html.toLowerCase();
  let rank = 40;
  const contact = (test: boolean, label: string) => { if (test) { signals.push({ label, kind: 'contact' }); rank += 7; } };
  contact(/wa\.me\/|api\.whatsapp\.com|whatsapp/.test(lower), 'WhatsApp listed');
  contact(/href=["']tel:/.test(lower), 'Phone listed');
  // Retina image names like logo@2x.png look like addresses, so image extensions are not accepted as a domain ending.
  contact(/href=["']mailto:|[\w.+-]+@[\w-]+\.(?!(?:png|jpe?g|webp|svg|gif)\b)[a-z]{2,}\b/.test(lower), 'Email listed');
  const gap = (test: boolean, label: string) => { if (test) { signals.push({ label, kind: 'gap' }); rank += 10; } };
  gap(!/<form[\s>]/.test(lower), 'No enquiry form');
  gap(!/<meta[^>]+name=["']viewport["']/.test(lower), 'Not mobile-friendly');
  gap(new URL(url).protocol !== 'https:', 'No HTTPS');
  const years = [...lower.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/g)].map(match => Number(match[1]));
  gap(years.length > 0 && Math.max(...years) < now.getFullYear() - 1, 'Outdated site');
  return { rank: Math.min(100, rank), signals };
}

const blocked = (label: string, rank: number): Precheck => ({ rank, signals: [{ label, kind: 'risk' }] });

export async function precheckLead(website: string): Promise<Precheck> {
  try {
    const { website: home } = await validatePublicUrl(website);
    const robots = await fetch(new URL('/robots.txt', home!), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(6_000) }).then(response => response.ok ? response.text() : '').catch(() => '');
    if (robots && !robotsAllowsHome(robots.slice(0, 200_000))) return blocked('Site asks crawlers not to visit', 30);
    const page = await fetchPublicHtml(home!);
    return scoreHomepage(page.html, page.url);
  } catch {
    return blocked('Website did not load', 10);
  }
}
