import { describe, expect, it } from 'vitest';
import { parseDiscoveryResponse } from '../lib/discovery';

const candidate = (sourceUrl: string) => ({ name: 'Example Studio', website: 'https://example.com', sourceUrl, description: 'Public website', industry: 'Design', city: 'Harare' });

describe('public lead discovery sources', () => {
  it('only returns candidates backed by an actual web search source', () => {
    const response = { output: [
      { type: 'web_search_call', action: { sources: [{ url: 'https://directory.example.org/listing' }] } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ candidates: [candidate('https://directory.example.org/listing'), { ...candidate('https://fake.example.org'), website: 'https://fake.example.org' }] }) }] },
    ] };
    expect(parseDiscoveryResponse(response, 5)).toEqual([candidate('https://directory.example.org/listing')]);
  });

  it('deduplicates company domains and rejects unsafe website URLs', () => {
    const response = { output: [
      { type: 'web_search_call', action: { sources: [{ url: 'https://directory.example.org/listing' }] } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ candidates: [candidate('https://directory.example.org/listing'), { ...candidate('https://directory.example.org/listing'), name: 'Same site again', website: 'https://www.example.com/about' }, { ...candidate('https://directory.example.org/listing'), website: 'https://user:pass@other.example' }] }) }] },
    ] };
    expect(parseDiscoveryResponse(response, 5)).toHaveLength(1);
  });
});
