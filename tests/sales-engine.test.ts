import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noAnswerGaps, openingMessage, outcomePlan, whatsappNumber } from '../lib/sales-cadence';
import { robotsAllowsHome, scoreHomepage } from '../lib/lead-precheck';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ company: null as Row | null, touches: 0, activities: [] as Row[], tasks: [] as Row[], closed: 0, updated: null as Row | null }));
vi.mock('@/lib/db', () => {
  const tx = {
    prospectCompany: { findFirst: async () => h.company, update: async ({ data }: { data: Row }) => { h.updated = data; return data; } },
    dealActivity: { count: async () => h.touches, create: async ({ data }: { data: Row }) => { h.activities.push(data); return data; } },
    followUpTask: { updateMany: async () => { h.closed++; return { count: 1 }; }, create: async ({ data }: { data: Row }) => { h.tasks.push(data); return data; } },
    auditLog: { create: async () => ({}) },
  };
  return { db: { ...tx, organizationMember: { findFirst: async () => ({ userId: 'user-1', organizationId: 'org-1', role: 'MEMBER' }) }, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } };
});
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/lib/redis', () => ({ redis: {}, connectRedis: async () => {}, rateLimit: async () => {} }));
vi.mock('@/lib/score-service', () => ({ recalculateCompanyScore: async () => ({}) }));
import { POST } from '../app/api/companies/[id]/outcome/route';

describe('follow-up cadence', () => {
  it('spaces unanswered touches across about 30 days, then moves to a 90-day check-back', () => {
    const days = noAnswerGaps.map((_, touches) => outcomePlan('NO_ANSWER', 'WHATSAPP', touches, 'NEW LEAD').followUp?.days);
    expect(days).toEqual([3, 4, 7, 16]);
    const finished = outcomePlan('NO_ANSWER', 'WHATSAPP', noAnswerGaps.length, 'CONTACTED');
    expect(finished.followUp).toMatchObject({ days: 90 });
    expect(finished.summary).toMatch(/Sequence finished after 5 touches/);
  });
  it('moves stages forward only, and never reopens a won deal', () => {
    expect(outcomePlan('NO_ANSWER', 'CALL', 0, 'QUALIFIED').stage).toBe('CONTACTED');
    expect(outcomePlan('NO_ANSWER', 'CALL', 0, 'PROPOSAL SENT').stage).toBe('PROPOSAL SENT');
    expect(outcomePlan('MEETING_BOOKED', 'CALL', 1, 'CONTACTED').stage).toBe('MEETING BOOKED');
    expect(outcomePlan('NOT_INTERESTED', 'CALL', 1, 'NEGOTIATION')).toMatchObject({ stage: 'LOST', followUp: null });
    expect(outcomePlan('NOT_INTERESTED', 'CALL', 1, 'WON').stage).toBe('WON');
  });
  it('follows the channel that was used for no-answer follow-ups', () => {
    expect(outcomePlan('NO_ANSWER', 'WHATSAPP', 0, 'NEW LEAD').followUp?.type).toBe('WHATSAPP');
    expect(outcomePlan('NO_ANSWER', 'VISIT', 0, 'NEW LEAD').followUp?.type).toBe('MEETING');
  });
});

describe('WhatsApp contact', () => {
  it('normalises Zimbabwean and international numbers for wa.me', () => {
    expect(whatsappNumber('077 123 4567')).toBe('263771234567');
    expect(whatsappNumber('+263 77 123 4567')).toBe('263771234567');
    expect(whatsappNumber('00263771234567')).toBe('263771234567');
    expect(whatsappNumber('771234567')).toBe('263771234567');
    expect(whatsappNumber('+27 82 123 4567')).toBe('27821234567');
    expect(whatsappNumber('ext 12')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
  it('opens with the observed website gap when there is one', () => {
    const message = openingMessage({ company: 'Cargo Co', sender: 'Nick Gwanzura', domain: 'cargo.co.zw', hook: 'No quote form on the homepage' });
    expect(message).toContain('this is Nick from Spiritus Systems');
    expect(message).toContain('cargo.co.zw and noticed: No quote form on the homepage.');
    expect(openingMessage({ company: 'Cargo Co', sender: 'Nick' })).not.toContain('noticed');
  });
});

describe('lead pre-check ranking', () => {
  it('honours robots.txt for the homepage, with the longest rule winning', () => {
    expect(robotsAllowsHome('User-agent: *\nDisallow: /')).toBe(false);
    expect(robotsAllowsHome('User-agent: *\nDisallow: /admin\n')).toBe(true);
    expect(robotsAllowsHome('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow:')).toBe(true);
    expect(robotsAllowsHome('User-agent: *\nDisallow: /\nAllow: /$\nAllow: /index')).toBe(false);
    expect(robotsAllowsHome('')).toBe(true);
  });
  it('ranks reachable sites with visible gaps above polished ones and explains every point', () => {
    const now = new Date('2026-10-20');
    const dated = scoreHomepage('<p>Call <a href="tel:+263771234567">us</a> or WhatsApp</p><footer>© 2019 Cargo</footer>', 'http://cargo.co.zw/', now);
    const polished = scoreHomepage('<meta name="viewport" content="width=device-width"><form></form><a href="mailto:a@b.co">mail</a><footer>© 2026</footer>', 'https://polished.co.zw/', now);
    expect(dated.signals.map(signal => signal.label)).toEqual(['WhatsApp listed', 'Phone listed', 'No enquiry form', 'Not mobile-friendly', 'No HTTPS', 'Outdated site']);
    expect(dated.rank).toBe(94);
    expect(polished.signals.map(signal => signal.label)).toEqual(['Email listed']);
    expect(dated.rank).toBeGreaterThan(polished.rank);
  });
  it('does not mistake retina image names for email addresses', () => {
    expect(scoreHomepage('<img src="logo@2x.png">', 'https://a.co.zw/').signals.map(signal => signal.label)).not.toContain('Email listed');
    expect(scoreHomepage('<p>sales@cargo.co.zw</p>', 'https://a.co.zw/').signals.map(signal => signal.label)).toContain('Email listed');
  });
});

describe('logging an outcome', () => {
  beforeEach(() => { h.company = { id: 'c1', stage: 'NEW LEAD' }; h.touches = 0; h.activities = []; h.tasks = []; h.closed = 0; h.updated = null; });
  const post = (body: unknown) => POST(new Request('http://localhost:3000/api/companies/c1/outcome', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'c1' }) });

  it('records the touch, closes open follow-ups, schedules the next one and moves the stage', async () => {
    const response = await post({ outcome: 'NO_ANSWER', channel: 'WHATSAPP' });
    expect(response.status).toBe(200);
    expect(h.activities[0]).toMatchObject({ type: 'TOUCH', body: 'WhatsApp · No answer (touch 1)' });
    expect(h.closed).toBe(1);
    expect(h.tasks[0]).toMatchObject({ title: 'Follow up (touch 2)', type: 'WHATSAPP', assignedTo: 'user-1' });
    expect(h.updated).toMatchObject({ stage: 'CONTACTED', nextFollowUp: null });
  });
  it('rejects unknown outcomes and companies outside the workspace', async () => {
    expect((await post({ outcome: 'MAYBE', channel: 'CALL' })).status).toBe(400);
    h.company = null;
    expect((await post({ outcome: 'INTERESTED', channel: 'CALL' })).status).toBe(404);
  });
});
