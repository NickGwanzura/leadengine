import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
import { briefDue, channelRows, harareDateKey, segmentMultipliers, segmentStats, weekStart, weeklyRows, type SegmentStats } from '../lib/sales-insights';
import { openingMessage } from '../lib/sales-cadence';
import { briefContent } from '../lib/morning-brief';

const log = (companyId: string, outcome: string, at: string, channel = 'WHATSAPP') => ({ companyId, outcome, channel, at: new Date(at) });

describe('Harare calendar', () => {
  it('starts weeks on Monday 00:00 Harare time', () => {
    // Sunday 23:30 UTC is already Monday 01:30 in Harare.
    expect(weekStart(new Date('2026-10-18T23:30:00Z')).toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(weekStart(new Date('2026-10-18T21:30:00Z')).toISOString()).toBe('2026-10-11T22:00:00.000Z');
  });
  it('sends the brief once per Harare day from 07:30', () => {
    expect(briefDue(new Date('2026-10-20T05:29:00Z'), null)).toBe(false);
    expect(briefDue(new Date('2026-10-20T05:30:00Z'), null)).toBe(true);
    expect(briefDue(new Date('2026-10-20T09:00:00Z'), '2026-10-20')).toBe(false);
    expect(briefDue(new Date('2026-10-20T09:00:00Z'), '2026-10-19')).toBe(true);
    expect(harareDateKey(new Date('2026-10-20T22:30:00Z'))).toBe('2026-10-21');
  });
});

describe('scorecard', () => {
  const now = new Date('2026-10-21T10:00:00Z');
  it('buckets contacts, replies, meetings and wins by week', () => {
    const rows = weeklyRows([log('a', 'NO_ANSWER', '2026-10-20T08:00:00Z'), log('b', 'INTERESTED', '2026-10-20T09:00:00Z'), log('c', 'MEETING_BOOKED', '2026-10-14T09:00:00Z'), log('d', 'NO_ANSWER', '2026-08-01T09:00:00Z')], [new Date('2026-10-19T09:00:00Z')], 3, now);
    expect(rows.map(row => [row.touches, row.responses, row.meetings, row.wins])).toEqual([[0, 0, 0, 0], [1, 1, 1, 0], [2, 1, 0, 1]]);
  });
  it('compares reply rates by channel', () => {
    expect(channelRows([log('a', 'NO_ANSWER', '2026-10-20T08:00:00Z', 'CALL'), log('b', 'INTERESTED', '2026-10-20T08:00:00Z'), log('c', 'NO_ANSWER', '2026-10-20T08:00:00Z')])).toEqual([{ channel: 'WHATSAPP', touches: 2, responses: 1 }, { channel: 'CALL', touches: 1, responses: 0 }]);
  });
  it('counts each company once per group and credits later stages as meetings', () => {
    const stats = segmentStats([{ id: 'a', segment: 'Freight', stage: 'WON' }, { id: 'b', segment: 'Freight', stage: 'CONTACTED' }, { id: 'c', segment: 'Clinics', stage: 'NEW LEAD' }, { id: 'd', segment: '', stage: 'WON' }], [log('a', 'NO_ANSWER', '2026-10-01T08:00:00Z'), log('a', 'INTERESTED', '2026-10-03T08:00:00Z'), log('b', 'NO_ANSWER', '2026-10-03T08:00:00Z')]);
    expect(stats).toEqual([{ name: 'Freight', leads: 2, contacted: 2, responded: 1, meetings: 1, won: 1 }, { name: 'Clinics', leads: 1, contacted: 0, responded: 0, meetings: 0, won: 0 }]);
  });
});

describe('learning which groups to search more', () => {
  const group = (name: string, contacted: number, responded: number, meetings: number, won: number): SegmentStats => ({ name, leads: contacted, contacted, responded, meetings, won });
  it('keeps the base interval until there is enough data', () => {
    expect(segmentMultipliers([group('A', 4, 4, 2, 1), group('B', 4, 0, 0, 0)])).toEqual({});
    expect(segmentMultipliers([group('A', 12, 6, 2, 1), group('B', 2, 0, 0, 0)])).toEqual({});
  });
  it('searches converting groups more often and weak groups less, within 0.5× to 2×', () => {
    const multipliers = segmentMultipliers([group('Strong', 8, 6, 3, 2), group('Weak', 8, 1, 0, 0), group('Thin', 2, 2, 2, 2)]);
    expect(multipliers.Strong).toBeLessThan(1);
    expect(multipliers.Weak).toBeGreaterThan(1);
    expect(multipliers.Strong).toBeGreaterThanOrEqual(0.5);
    expect(multipliers.Weak).toBeLessThanOrEqual(2);
    expect(multipliers.Thin).toBeUndefined();
  });
});

describe('tailored opener and morning brief', () => {
  it('names the target group service after the observed gap', () => {
    expect(openingMessage({ company: 'Cargo Co', sender: 'Nick', domain: 'cargo.co.zw', hook: 'Quotes are phone-only', service: 'ShippingOS', industry: 'Logistics' })).toContain('noticed: Quotes are phone-only. Our ShippingOS helps logistics businesses fix exactly this.');
    expect(openingMessage({ company: 'Cargo Co', sender: 'Nick', service: 'ShippingOS', industry: 'Logistics' })).toContain('our ShippingOS could be a good fit for Cargo Co.');
  });
  it('summarises the day and skips empty days', () => {
    const item = (name: string, reason: string, score: number | null) => ({ company: { name }, reason, score }) as never;
    const content = briefContent({ due: [item('Cargo <Co>', 'Overdue: Follow up', 78)], newLeads: [item('Realty', 'New lead, not contacted yet', null)], goneQuiet: [] }, 'https://leados.example', 'Nick Gwanzura');
    expect(content?.subject).toBe('Today: 1 follow-up due, 1 new lead');
    expect(content?.text).toContain('Good morning Nick,');
    expect(content?.text).toContain('• Cargo <Co>: Overdue: Follow up (78/100)');
    expect(content?.html).toContain('Cargo &lt;Co&gt;');
    expect(content?.text).toContain('https://leados.example/#today');
    expect(briefContent({ due: [], newLeads: [], goneQuiet: [] }, 'https://leados.example', 'Nick')).toBeNull();
  });
});
