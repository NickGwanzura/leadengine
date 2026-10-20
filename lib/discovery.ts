import { z } from 'zod';

const candidateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.url().max(2048),
  sourceUrl: z.url().max(2048),
  description: z.string().trim().max(500),
  industry: z.string().trim().max(100),
  city: z.string().trim().max(100),
  fitReason: z.string().trim().max(400).catch(''),
});

export type DiscoveryCandidate = z.infer<typeof candidateSchema>;
const responseSchema = z.object({ output: z.array(z.unknown()) });
const candidatesSchema = z.object({ candidates: z.array(z.unknown()).max(30) });

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

function parseCandidateEnvelope(raw: unknown) {
  const output = responseSchema.safeParse(raw);
  if (!output.success) return null;
  const messages: string[] = [];
  for (const item of output.data.output) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (entry.type !== 'message' || !Array.isArray(entry.content)) continue;
    for (const part of entry.content) {
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') messages.push(part.text);
    }
  }
  let parsed: unknown;
  try { parsed = JSON.parse(messages.join('\n').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return null; }
  const candidates = candidatesSchema.safeParse(parsed);
  return candidates.success ? { output: output.data.output, candidates: candidates.data.candidates } : null;
}

export function hasDiscoveryResponseEnvelope(raw: unknown) {
  return parseCandidateEnvelope(raw) !== null;
}

export function parseDiscoveryResponse(raw: unknown, limit: number): DiscoveryCandidate[] {
  const envelope = parseCandidateEnvelope(raw);
  if (!envelope) return [];
  const citations = new Set<string>();

  for (const item of envelope.output) {
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
        for (const annotation of content.annotations || []) {
          const key = annotation.type === 'url_citation' && annotation.url ? citationKey(annotation.url) : null;
          if (key) citations.add(key);
        }
      }
    }
  }

  const domains = new Set<string>();
  return envelope.candidates.flatMap(rawCandidate => {
    if (!rawCandidate || typeof rawCandidate !== 'object') return [];
    const raw = rawCandidate as Record<string, unknown>;
    const candidate = candidateSchema.safeParse({
      name: raw.name,
      website: raw.website ?? raw.officialWebsite ?? raw['official website'],
      sourceUrl: raw.sourceUrl ?? raw.source_url,
      description: raw.description ?? '',
      industry: raw.industry ?? '',
      city: raw.city ?? '',
      fitReason: raw.fitReason ?? raw.fit_reason ?? '',
    });
    if (!candidate.success) return [];
    const source = citationKey(candidate.data.sourceUrl);
    const website = new URL(candidate.data.website);
    if (!source || !citations.has(source) || !['https:', 'http:'].includes(website.protocol) || website.username || website.password) return [];
    const domain = website.hostname.toLowerCase().replace(/^www\./, '');
    if (domains.has(domain)) return [];
    domains.add(domain);
    return [candidate.data];
  }).slice(0, limit);
}
