import { z } from 'zod';

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

export type AiMessage = { role: 'system' | 'user'; content: string };

export function aiConfiguration() {
  const provider = process.env.AI_PROVIDER?.trim() || 'openai-compatible';
  const model = process.env.AI_MODEL?.trim() || 'gpt-4.1-mini';
  const apiKey = process.env.AI_API_KEY?.trim() || '';
  const rawBaseUrl = process.env.AI_BASE_URL?.trim() || 'https://api.openai.com/v1';
  let baseUrl: URL | null = null;
  try {
    const parsed = new URL(rawBaseUrl);
    const localDev = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if ((parsed.protocol === 'https:' || (localDev && parsed.protocol === 'http:')) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash) baseUrl = parsed;
  } catch { /* configuration is reported as unavailable below */ }
  const configured = provider === 'openai-compatible' && Boolean(apiKey && model && baseUrl);
  return { configured, provider, model, ...(baseUrl ? { destination: baseUrl.origin } : {}), ...(configured ? { apiKey, baseUrl: baseUrl! } : {}) };
}

export function publicAiStatus() {
  const config = aiConfiguration();
  return { configured: config.configured, provider: config.provider, model: config.model, destination: config.destination ?? null };
}

export async function generateChatText(messages: AiMessage[], fetcher: typeof fetch = fetch, timeoutMs = 30_000) {
  const config = aiConfiguration();
  if (!config.configured) throw new Error('AI_NOT_CONFIGURED');
  const endpoint = new URL('chat/completions', config.baseUrl!.toString().replace(/\/$/, '') + '/');
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages, response_format: { type: 'json_object' }, store: false }),
    });
  } catch {
    throw new Error('AI_PROVIDER_UNAVAILABLE');
  }
  if (!response.ok) throw new Error(response.status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : 'AI_PROVIDER_REQUEST_FAILED');
  const parsed = completionSchema.safeParse(await response.json().catch(() => null));
  const content = parsed.success ? parsed.data.choices[0]?.message.content?.trim() : '';
  if (!content) throw new Error('AI_PROVIDER_INVALID_RESPONSE');
  return { content, provider: config.provider, model: config.model };
}
