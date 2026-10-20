import { describe, expect, it } from 'vitest';
import { isDue, pageText, parseProfile, profileLinks, refreshHours } from '../lib/business-profile';
import { parseDiscoveryResponse } from '../lib/discovery';

const segment = { name: 'Freight forwarders', industry: 'Logistics', location: 'Harare, Zimbabwe', keywords: 'clearing agents', painPoint: 'Manual tracking', service: 'ShippingOS' };

describe('business profile analysis', () => {
  it('keeps valid segments, drops broken or duplicate ones and defaults the location', () => {
    const profile = parseProfile('```json\n' + JSON.stringify({ summary: 'Spiritus builds business software for Zimbabwean companies.', services: [{ name: 'ShippingOS', description: 'Logistics platform' }, { bad: true }], segments: [segment, { ...segment, name: 'freight FORWARDERS' }, { name: 'X' }, { name: 'Schools', industry: 'Education' }] }) + '\n```');
    expect(profile.services).toEqual([{ name: 'ShippingOS', description: 'Logistics platform' }]);
    expect(profile.segments.map(item => item.name)).toEqual(['Freight forwarders', 'Schools']);
    expect(profile.segments[1].location).toBe('Zimbabwe');
  });

  it('rejects a profile without any usable segment', () => {
    expect(() => parseProfile(JSON.stringify({ summary: 'A business with no clear customers.', services: [], segments: [] }))).toThrow(/segments/);
    expect(() => parseProfile('not json')).toThrow(/unreadable/);
  });

  it('follows only same-site pages that describe services or customers', () => {
    const html = '<a href="/services/web">Web</a><a href="https://other.com/services">x</a><a href="/blog/post">Blog</a><a href="/about-us#team">About</a><a href="/">Home</a>';
    expect(profileLinks(html, new URL('https://spiritus.co.zw/'))).toEqual(['https://spiritus.co.zw/services/web', 'https://spiritus.co.zw/about-us']);
  });

  it('extracts readable text without scripts or styles', () => {
    expect(pageText('<style>.a{}</style><h1>We build&nbsp;software</h1><script>alert(1)</script><p>for &amp; with you</p>')).toBe('We build software for & with you');
  });
});

describe('round-the-clock search scheduling', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const ago = (minutes: number) => new Date(now - minutes * 60000);
  it('runs new targets immediately and repeats completed ones after the refresh window', () => {
    expect(isDue(undefined, now)).toBe(true);
    expect(isDue({ status: 'COMPLETED', startedAt: ago(30) }, now)).toBe(false);
    expect(isDue({ status: 'COMPLETED', startedAt: ago(refreshHours * 60 + 1) }, now)).toBe(true);
  });
  it('retries failures after 15 minutes and recovers stalled runs', () => {
    expect(isDue({ status: 'FAILED', startedAt: ago(5) }, now)).toBe(false);
    expect(isDue({ status: 'FAILED', startedAt: ago(16) }, now)).toBe(true);
    expect(isDue({ status: 'RUNNING', startedAt: ago(1) }, now)).toBe(false);
    expect(isDue({ status: 'RUNNING', startedAt: ago(3) }, now)).toBe(true);
  });
});

describe('lead fit reasons', () => {
  it('keeps the sourced fit reason from web search', () => {
    const lead = { name: 'Cargo Co', website: 'https://cargo.co.zw', sourceUrl: 'https://cargo.co.zw/about', description: 'Freight firm', industry: 'Logistics', city: 'Harare', fitReason: 'Lists manual booking by phone.' };
    const response = { output: [{ type: 'web_search_call', action: { sources: [{ url: lead.sourceUrl }] } }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ candidates: [lead] }) }] }] };
    expect(parseDiscoveryResponse(response, 3)[0].fitReason).toBe('Lists manual booking by phone.');
  });
});
