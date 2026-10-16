import { z } from 'zod';

const candidateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.url().max(2048),
  sourceUrl: z.url().max(2048),
  description: z.string().trim().max(500),
  industry: z.string().trim().max(100),
  city: z.string().trim().max(100),
});

export type DiscoveryCandidate = z.infer<typeof candidateSchema>;

function citationKey(raw: string) {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}

export function parseDiscoveryResponse(raw: unknown, limit: number): DiscoveryCandidate[] {
  const output = z.object({ output: z.array(z.unknown()) }).safeParse(raw);
  if (!output.success) return [];
  const citations = new Set<string>();
  const messages: string[] = [];

  for (const item of output.data.output) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (entry.type === 'web_search_call') {
      const action = entry.action as { sources?: Array<{ url?: string }> } | undefined;
      for (const source of action?.sources || []) {
        const key = source && typeof source.url === 'string' ? citationKey(source.url) : null;
        if (key) citations.add(key);
      }
    }
    if (entry.type === 'message' && Array.isArray(entry.content)) {
      for (const part of entry.content) {
        if (!part || typeof part !== 'object') continue;
        const content = part as { text?: string; annotations?: Array<{ type?: string; url?: string }> };
        if (typeof content.text === 'string') messages.push(content.text);
        for (const annotation of content.annotations || []) {
          const key = annotation.type === 'url_citation' && annotation.url ? citationKey(annotation.url) : null;
          if (key) citations.add(key);
        }
      }
    }
  }

  const text = messages.join('\n').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return []; }
  const candidates = z.object({ candidates: z.array(candidateSchema).max(30) }).safeParse(parsed);
  if (!candidates.success) return [];

  const domains = new Set<string>();
  return candidates.data.candidates.filter(candidate => {
    const source = citationKey(candidate.sourceUrl);
    const website = new URL(candidate.website);
    if (!source || !citations.has(source) || !['https:', 'http:'].includes(website.protocol) || website.username || website.password) return false;
    const domain = website.hostname.toLowerCase().replace(/^www\./, '');
    if (domains.has(domain)) return false;
    domains.add(domain);
    return true;
  }).slice(0, limit);
}
