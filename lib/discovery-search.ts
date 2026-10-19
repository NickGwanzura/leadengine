import { ApiError } from '@/lib/access';
import { aiConfiguration } from '@/lib/ai-provider';
import { parseDiscoveryResponse } from '@/lib/discovery';

export type DiscoveryQuery = { industry: string; location: string; keywords?: string; service?: string; size?: string; limit: number; excludedDomains?: string[] };

export async function searchPublicBusinesses({ industry, location, keywords = '', service = '', size = '', limit, excludedDomains = [] }: DiscoveryQuery) {
  const config = aiConfiguration();
  if (!config.configured || config.baseUrl?.origin !== 'https://api.openai.com') throw new ApiError(503, 'Lead Discovery needs the configured OpenAI API key and official OpenAI endpoint');
  const prompt = `Search the public web for up to ${limit} real businesses in ${location} in the ${industry} industry. ${keywords ? `Keywords: ${keywords}.` : ''} ${size ? `Size preference: ${size}.` : ''} ${service ? `Our potential service category: ${service}.` : ''} ${excludedDomains.length ? `Find NEW businesses; exclude these previously reviewed website domains: ${excludedDomains.join(', ')}.` : ''}\nReturn ONLY a JSON object in this exact shape: {"candidates":[{"name":"Company name","website":"https://official.example","sourceUrl":"https://source.example","description":"Short sourced fact","industry":"Industry","city":"City"}]}. Keep those exact camelCase keys, especially website and sourceUrl. Use sourceUrl exactly as a URL in the web search sources or citations. Include a company only when a source supports its existence and official website. Do not invent websites, contacts, size, software needs or purchase intent. An empty candidates array is valid.`;
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.AI_DISCOVERY_MODEL?.trim() || config.model, tools: [{ type: 'web_search' }], tool_choice: 'required', include: ['web_search_call.action.sources'], input: prompt, max_output_tokens: 2000, store: false }),
    });
  } catch { throw new ApiError(502, 'Web search could not be reached'); }
  if (response.status === 429) throw new ApiError(429, 'Web search rate limit reached');
  if (!response.ok) throw new ApiError(502, 'Web search request failed. Check the configured model and API access');
  return parseDiscoveryResponse(await response.json().catch(() => null), limit);
}
