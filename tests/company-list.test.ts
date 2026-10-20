import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  companies: [] as Row[],
  calls: [] as Row[],
  session: { user: { id: 'user-1' } } as { user: { id: string } } | null,
}));

const member = { id: 'member-1', userId: 'user-1', organizationId: 'org-1', role: 'MEMBER' };

vi.mock('@/lib/db', () => ({
  db: {
    organizationMember: { findFirst: async () => (h.session ? member : null) },
    prospectCompany: {
      findMany: async (args: Row) => {
        h.calls.push(args);
        return h.companies;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        h.companies.find(row => row.id === where.id && row.organizationId === where.organizationId) ?? null,
    },
  },
}));
vi.mock('@/auth', () => ({ auth: async () => h.session }));
vi.mock('@/lib/redis', () => ({ redis: {}, connectRedis: async () => {}, rateLimit: async () => {} }));

import { GET } from '../app/api/companies/route';
import { GET as GET_ONE } from '../app/api/companies/[id]/route';

const url = 'http://localhost:3000/api/companies';
const summaryUrl = `${url}?view=summary`;

function company(overrides: Row = {}): Row {
  return {
    id: 'company-1',
    organizationId: 'org-1',
    name: 'Example Holdings',
    domain: 'example.com',
    website: 'https://example.com/',
    industry: 'Industrial',
    city: 'Harare',
    country: 'Zimbabwe',
    email: null,
    phone: null,
    notes: 'Met at the expo.',
    stage: 'QUALIFIED',
    dealValue: '1200.00',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    updatedAt: new Date('2026-10-02T09:00:00Z'),
    nextFollowUp: null,
    assignedProduct: null,
    contactPerson: null,
    contactPosition: null,
    sizeEstimate: null,
    score: { total: 41, override: null, explanation: 'Deterministic score.', updatedAt: new Date('2026-10-02T09:00:00Z') },
    _count: { audits: 2 },
    jobs: [{ id: 'job-1', status: 'RUNNING', progress: 35, error: null, createdAt: new Date('2026-10-02T09:00:00Z') }],
    ...overrides,
  };
}

beforeEach(() => {
  h.companies = [company()];
  h.calls = [];
  h.session = { user: { id: 'user-1' } };
});

describe('company list polling', () => {
  it('asks the database only for summary fields, never audit or timeline relations', async () => {
    const response = await GET(new Request(summaryUrl));
    expect(response.status).toBe(200);
    const select = h.calls[0].select as Row;
    expect(select).toBeTruthy();
    expect(select).not.toHaveProperty('audits');
    expect(select).not.toHaveProperty('activities');
    expect(select.jobs).toMatchObject({ take: 1 });
    expect(select.score).toEqual({ select: expect.objectContaining({ total: true }) });
  });

  it('returns the fields the table and job progress need, without the evidence graph', async () => {
    const body = await (await GET(new Request(summaryUrl))).json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: 'company-1', name: 'Example Holdings', stage: 'QUALIFIED', _count: { audits: 2 } });
    expect(body[0].jobs[0]).toMatchObject({ status: 'RUNNING', progress: 35 });
    expect(body[0]).not.toHaveProperty('audits');
    expect(body[0]).not.toHaveProperty('activities');
  });

  it('answers an unchanged poll with 304 and no body', async () => {
    const first = await GET(new Request(summaryUrl));
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(first.headers.get('cache-control')).toBe('private, no-cache');

    const second = await GET(new Request(summaryUrl, { headers: { 'if-none-match': etag! } }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('serves a new payload when job progress changes', async () => {
    const first = await GET(new Request(summaryUrl));
    const etag = first.headers.get('etag');
    h.companies = [company({ jobs: [{ id: 'job-1', status: 'RUNNING', progress: 60, error: null, createdAt: new Date('2026-10-02T09:00:00Z') }] })];

    const second = await GET(new Request(summaryUrl, { headers: { 'if-none-match': etag! } }));
    expect(second.status).toBe(200);
    expect((await second.json())[0].jobs[0].progress).toBe(60);
  });

  it('requires a signed-in member', async () => {
    h.session = null;
    const response = await GET(new Request(summaryUrl));
    expect(response.status).toBe(401);
  });

  it('keeps the full listing available for direct callers', async () => {
    const response = await GET(new Request(url));
    const include = h.calls[0].include as Row;
    expect(include).toHaveProperty('audits');
    expect(include).toHaveProperty('activities');
    expect(response.status).toBe(200);
  });
});

describe('company detail', () => {
  it('loads one company inside the member organization', async () => {
    const response = await GET_ONE(new Request(`${url}/company-1`), { params: Promise.resolve({ id: 'company-1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'company-1', name: 'Example Holdings' });
  });

  it('does not disclose another organization\'s company', async () => {
    const response = await GET_ONE(new Request(`${url}/company-other`), { params: Promise.resolve({ id: 'company-other' }) });
    expect(response.status).toBe(404);
  });
});
