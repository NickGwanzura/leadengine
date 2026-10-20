import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const h = vi.hoisted(() => {
  const store = {
    jobs: [] as Row[],
    audits: [] as Row[],
    activities: [] as Row[],
    logs: [] as Row[],
    companies: [] as Row[],
    scores: [] as Row[],
    rawLocks: 0,
  };

  const value = (row: Row, key: string) => row[key];
  const time = (raw: unknown) => (raw instanceof Date ? raw.getTime() : new Date(String(raw)).getTime());

  function matches(row: Row, where: Where = {}): boolean {
    for (const [key, condition] of Object.entries(where)) {
      if (key === 'OR') {
        if (!(condition as Where[]).some(clause => matches(row, clause))) return false;
        continue;
      }
      if (key === 'AND') {
        if (!(condition as Where[]).every(clause => matches(row, clause))) return false;
        continue;
      }
      const actual = value(row, key);
      if (condition === null) {
        if (actual !== null && actual !== undefined) return false;
        continue;
      }
      if (condition instanceof Date) {
        if (time(actual) !== condition.getTime()) return false;
        continue;
      }
      if (condition && typeof condition === 'object') {
        const operators = condition as Record<string, unknown>;
        if ('lt' in operators && !(actual != null && time(actual) < time(operators.lt))) return false;
        if ('lte' in operators && !(actual != null && time(actual) <= time(operators.lte))) return false;
        if ('gt' in operators && !(actual != null && time(actual) > time(operators.gt))) return false;
        if ('gte' in operators && !(actual != null && time(actual) >= time(operators.gte))) return false;
        if ('in' in operators && !(operators.in as unknown[]).includes(actual)) return false;
        continue;
      }
      if (actual !== condition) return false;
    }
    return true;
  }

  function apply(row: Row, data: Where = {}) {
    for (const [key, entry] of Object.entries(data)) {
      if (entry && typeof entry === 'object' && 'increment' in (entry as Row)) {
        row[key] = Number(row[key] ?? 0) + Number((entry as { increment: number }).increment);
      } else {
        row[key] = entry;
      }
    }
    return row;
  }

  const db = {
    crawlJob: {
      findFirst: async ({ where }: { where: Where }) => {
        const found = store.jobs.find(row => matches(row, where));
        return found ? { ...found } : null;
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.jobs.find(candidate => matches(candidate, where));
        if (!row) throw new Error('Record to update not found');
        return { ...apply(row, data) };
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const rows = store.jobs.filter(candidate => matches(candidate, where));
        rows.forEach(row => apply(row, data));
        return { count: rows.length };
      },
    },
    prospectCompany: {
      findUniqueOrThrow: async ({ where }: { where: Where }) => {
        const row = store.companies.find(candidate => candidate.id === where.id);
        if (!row) throw new Error('Company not found');
        return { ...row, activities: [], followUpTasks: [], audits: [] };
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const rows = store.companies.filter(candidate => matches(candidate, where));
        rows.forEach(row => apply(row, data));
        return { count: rows.length };
      },
    },
    websiteAudit: {
      create: async ({ data }: { data: Row }) => {
        const audit = { ...data, id: `audit-${store.audits.length + 1}` };
        store.audits.push(audit);
        return audit;
      },
    },
    leadScore: {
      upsert: async ({ where, create, update }: { where: Where; create: Row; update: Row }) => {
        const existing = store.scores.find(row => row.companyId === where.companyId);
        if (existing) return Object.assign(existing, update);
        const created = { ...create };
        store.scores.push(created);
        return created;
      },
    },
    dealActivity: {
      create: async ({ data }: { data: Row }) => {
        store.activities.push(data);
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        store.logs.push(data);
        return data;
      },
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    $executeRaw: async () => {
      store.rawLocks += 1;
      return 1;
    },
  };

  return { store, db };
});

vi.mock('@/lib/db', () => ({ db: h.db }));
vi.mock('@/auth', () => ({ auth: async () => null, handlers: {}, signIn: async () => {}, signOut: async () => {} }));
vi.mock('@/lib/redis', () => ({ redis: {}, connectRedis: async () => {}, rateLimit: async () => {} }));

import { POST } from '../app/api/internal/jobs/route';

const SECRET = 'c'.repeat(32);

function enqueue(overrides: Row = {}) {
  const job = {
    id: 'job-1',
    companyId: 'company-1',
    url: 'https://example.com/',
    status: 'QUEUED',
    progress: 0,
    attempt: 0,
    maxAttempts: 3,
    approvedBy: 'user-1',
    approvedAt: new Date(),
    approvedDomain: 'example.com',
    error: null,
    availableAt: new Date(Date.now() - 1000),
    startedAt: null,
    finishedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    createdAt: new Date(Date.now() - 5000),
    ...overrides,
  };
  h.store.jobs.push(job);
  return job;
}

function company(overrides: Row = {}) {
  const record = {
    id: 'company-1',
    organizationId: 'spiritus',
    name: 'Example',
    industry: 'Industrial',
    stage: 'NEW LEAD',
    dealValue: 0,
    website: 'https://example.com/',
    email: null,
    phone: null,
    notes: '',
    ...overrides,
  };
  h.store.companies.push(record);
  return record;
}

async function call(body: unknown, { secret = SECRET }: { secret?: string } = {}) {
  const response = await POST(new Request('http://localhost:3000/api/internal/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

const crawlResult = {
  pages: [{ url: 'https://example.com/', title: 'Example', statusCode: 200, metadata: { h1: ['Example'] } }],
  findings: [{
    category: 'Public contact channels',
    classification: 'VERIFIED',
    observation: '1 public email link and 1 public phone link were observed.',
    recommendation: 'Verify the best contact route before outreach.',
    sourceUrl: 'https://example.com/',
    evidence: { publicEmails: ['hello@example.com'], publicPhones: ['+263 77 123 4567'] },
    confidence: 1,
  }],
  summary: 'Inspected 1 approved public HTML page.',
};

beforeEach(() => {
  process.env.INTERNAL_API_SECRET = SECRET;
  for (const key of ['jobs', 'audits', 'activities', 'logs', 'companies', 'scores'] as const) h.store[key].length = 0;
  h.store.rawLocks = 0;
});

describe('crawl job lifecycle', () => {
  it('rejects a worker without the internal secret', async () => {
    enqueue();
    const result = await call({ action: 'claim' }, { secret: 'x'.repeat(32) });
    expect(result.status).toBe(401);
    expect(h.store.jobs[0].status).toBe('QUEUED');
  });

  it('claims a queued job under an advisory lock and issues a lease', async () => {
    enqueue();
    const result = await call({ action: 'claim' });
    expect(result.status).toBe(200);
    expect(result.body.job).toMatchObject({ id: 'job-1', status: 'RUNNING', attempt: 1, progress: 5 });
    expect(result.body.job.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(result.body.job.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(h.store.rawLocks).toBe(1);
  });

  it('returns no job when the queue is empty', async () => {
    const result = await call({ action: 'claim' });
    expect(result.status).toBe(200);
    expect(result.body.job).toBeNull();
  });

  it('reports progress only for the current lease', async () => {
    const leaseToken = 'lease-1';
    enqueue({ status: 'RUNNING', attempt: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) });

    expect((await call({ action: 'progress', id: 'job-1', leaseToken: 'stale', progress: 50 })).status).toBe(409);
    expect(h.store.jobs[0].progress).toBe(0);

    const result = await call({ action: 'progress', id: 'job-1', leaseToken, progress: 50 });
    expect(result.status).toBe(200);
    expect(h.store.jobs[0].progress).toBe(50);
  });

  it('rejects evidence from a host other than the approved domain', async () => {
    const leaseToken = 'lease-1';
    enqueue({ status: 'RUNNING', attempt: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) });
    company();
    const result = await call({
      action: 'complete',
      id: 'job-1',
      leaseToken,
      result: { ...crawlResult, findings: [{ ...crawlResult.findings[0], sourceUrl: 'https://evil.example/contact' }] },
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Evidence must belong to the approved domain');
    expect(h.store.audits).toHaveLength(0);
    expect(h.store.jobs[0].status).toBe('RUNNING');
  });

  it('stores a completed audit, enriches an empty contact and rescores the company', async () => {
    const leaseToken = 'lease-1';
    enqueue({ status: 'RUNNING', attempt: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) });
    company();

    const result = await call({ action: 'complete', id: 'job-1', leaseToken, result: crawlResult });
    expect(result.status).toBe(200);
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({ companyId: 'company-1', jobId: 'job-1', summary: crawlResult.summary });
    expect(h.store.companies[0]).toMatchObject({ email: 'hello@example.com', phone: '+263 77 123 4567' });
    expect(h.store.scores).toHaveLength(1);
    expect(h.store.scores[0].companyId).toBe('company-1');
    expect(h.store.jobs[0]).toMatchObject({ status: 'COMPLETED', progress: 100, leaseToken: null });
    expect(h.store.activities[0]).toMatchObject({ type: 'AUDIT_COMPLETED' });
    expect(h.store.logs[0]).toMatchObject({ action: 'AUDIT_ENRICHED_AND_SCORED' });
  });

  it('never overwrites a contact the team already recorded', async () => {
    const leaseToken = 'lease-1';
    enqueue({ status: 'RUNNING', attempt: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) });
    company({ email: 'owner@example.com', phone: '+263 24 222 0000' });

    await call({ action: 'complete', id: 'job-1', leaseToken, result: crawlResult });
    expect(h.store.companies[0]).toMatchObject({ email: 'owner@example.com', phone: '+263 24 222 0000' });
  });

  it('returns a failed job to the queue when the worker reports a retryable error', async () => {
    const leaseToken = 'lease-1';
    enqueue({ status: 'RUNNING', attempt: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) });

    const result = await call({ action: 'fail', id: 'job-1', leaseToken, error: 'NETWORK_TIMEOUT', retryable: true });
    expect(result.status).toBe(200);
    expect(h.store.jobs[0]).toMatchObject({ status: 'QUEUED', error: 'NETWORK_TIMEOUT', leaseToken: null });
    expect(new Date(h.store.jobs[0].availableAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('fails a job permanently when the worker reports a policy refusal', async () => {
    const leaseToken = 'lease-1';
    enqueue({ status: 'RUNNING', attempt: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) });

    await call({ action: 'fail', id: 'job-1', leaseToken, error: 'ROBOTS_DENIED_OR_UNAVAILABLE', retryable: false });
    expect(h.store.jobs[0]).toMatchObject({ status: 'FAILED', error: 'ROBOTS_DENIED_OR_UNAVAILABLE' });
    expect(h.store.jobs[0].finishedAt).toBeInstanceOf(Date);
  });
});
