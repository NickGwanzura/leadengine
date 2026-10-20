import { z } from 'zod';
import { generateChatText } from '@/lib/ai-provider';
import { validatePublicUrl } from '@/lib/url-security';

const text = (max: number) => z.string().trim().max(max).catch('');
export const segmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  industry: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(100).catch('Zimbabwe'),
  keywords: text(200),
  painPoint: text(300),
  service: text(100),
});
export const serviceSchema = z.object({ name: z.string().trim().min(2).max(100), description: text(300) });
const profileSchema = z.object({
  summary: z.string().trim().min(10).max(800),
  services: z.array(z.unknown()).max(20),
  segments: z.array(z.unknown()).max(20),
});
export type Segment = z.infer<typeof segmentSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type AnalysedProfile = { summary: string; services: Service[]; segments: Segment[] };
export const maxSegments = 8;
// How long a completed search for one target is reused before it is due again.
export const refreshHours = Math.max(1, Number(process.env.DISCOVERY_REFRESH_HOURS) || 6);
export const staleRunMs = 2 * 60000;
const failedRetryMs = 15 * 60000;
export function isDue(run: { status: string; startedAt: Date } | undefined, now = Date.now()) {
  if (!run) return true;
  const age = now - run.startedAt.getTime();
  if (run.status === 'RUNNING') return age > staleRunMs;
  if (run.status === 'FAILED') return age > failedRetryMs;
  return age > refreshHours * 3600000;
}

const pageLimit = 5;
const charsPerPage = 3500;
// Links whose path suggests what the business sells or who it serves.
const usefulPath = /(service|solution|product|offer|what-we-do|industr|sector|client|customer|pricing|package|about|portfolio|case-stud)/i;

export function pageText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pageTitle(html: string) {
  return pageText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 200);
}

export function profileLinks(html: string, base: URL) {
  const found = new Set<string>();
  for (const match of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], base);
      url.hash = ''; url.search = '';
      if (url.hostname !== base.hostname || !['https:', 'http:'].includes(url.protocol) || url.href === base.href || !usefulPath.test(url.pathname)) continue;
      found.add(url.href);
    } catch { /* ignore malformed links */ }
  }
  return [...found].slice(0, pageLimit - 1);
}

// Every hop is re-checked so a redirect cannot reach a private address.
async function fetchPublicHtml(raw: string) {
  let target = raw;
  for (let hop = 0; hop < 4; hop++) {
    const { website } = await validatePublicUrl(target);
    const response = await fetch(website!, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12_000), headers: { 'user-agent': 'SpiritusLeadOS/1.0 (+business profile analysis)', accept: 'text/html' } });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) { target = new URL(location, website!).href; continue; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!(response.headers.get('content-type') || '').includes('html')) throw new Error('Not an HTML page');
    return { url: response.url || website!, html: (await response.text()).slice(0, 1_000_000) };
  }
  throw new Error('Too many redirects');
}

export function parseProfile(content: string): AnalysedProfile {
  let raw: unknown;
  try { raw = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw new Error('The AI returned an unreadable profile. Try again.'); }
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) throw new Error('The AI profile was missing a summary, services or customer segments. Try again.');
  const services = parsed.data.services.flatMap(item => { const result = serviceSchema.safeParse(item); return result.success ? [result.data] : []; });
  const seen = new Set<string>();
  const segments = parsed.data.segments.flatMap(item => {
    const result = segmentSchema.safeParse(item);
    if (!result.success || seen.has(result.data.name.toLowerCase())) return [];
    seen.add(result.data.name.toLowerCase());
    return [result.data];
  }).slice(0, maxSegments);
  if (!segments.length) throw new Error('No target customer segments could be identified from the website.');
  return { summary: parsed.data.summary, services, segments };
}

export async function analyseBusinessWebsite(website: string) {
  const home = await fetchPublicHtml(website);
  const pages = [{ url: home.url, title: pageTitle(home.html), text: pageText(home.html).slice(0, charsPerPage) }];
  // Subpages load in parallel; a broken one should not block the profile.
  const subpages = await Promise.allSettled(profileLinks(home.html, new URL(home.url)).map(fetchPublicHtml));
  for (const result of subpages) if (result.status === 'fulfilled') pages.push({ url: result.value.url, title: pageTitle(result.value.html), text: pageText(result.value.html).slice(0, charsPerPage) });
  const evidence = pages.map(page => `PAGE ${page.url}\nTITLE ${page.title}\n${page.text}`).join('\n\n');
  const { content } = await generateChatText([
    { role: 'system', content: 'You are a B2B go-to-market analyst. From a company\'s own website text, describe what it sells and who its best-fit customers are. Base every statement on the website text; do not invent clients, prices or certifications. Reply with JSON only.' },
    { role: 'user', content: `Analyse this business website and return JSON exactly in this shape:\n{"summary":"2-3 sentences: what the business does and for whom","services":[{"name":"Service name","description":"One sentence"}],"segments":[{"name":"Short label for the customer group","industry":"Industry to search for","location":"Country or city to search in (use the business's own market if it is not stated)","keywords":"Search keywords that identify these businesses","painPoint":"The problem this group has that the services solve","service":"Which of the services above fits them"}]}\nReturn 3 to ${maxSegments} distinct segments of businesses (not consumers) that would buy these services, most valuable first.\n\n${evidence}` },
  ], fetch, 90_000);
  return { ...parseProfile(content), pages: pages.map(({ url, title }) => ({ url, title })) };
}

export function readSegments(raw: unknown): Segment[] {
  return Array.isArray(raw) ? raw.flatMap(item => { const result = segmentSchema.safeParse(item); return result.success ? [result.data] : []; }) : [];
}
export function readServices(raw: unknown): Service[] {
  return Array.isArray(raw) ? raw.flatMap(item => { const result = serviceSchema.safeParse(item); return result.success ? [result.data] : []; }) : [];
}
