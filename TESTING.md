# Testing

Run `npm ci`, `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Worker source can be syntax checked with `PYTHONPYCACHEPREFIX=/tmp/leados-pycache python3 -m compileall -q worker`; install `worker/requirements.txt` and run `pytest worker/tests` for security and evidence classification tests.

For an end-to-end smoke test on a Docker host: build and start Compose, run the seed profile, sign in, create a company with a controlled public website, approve the crawl, watch QUEUED → RUNNING → COMPLETED, inspect source URLs and audit classifications, cancel a queued job, import a small CSV and roll it back before editing the imported records. Inspect the worker and app logs for blocked private addresses and redirects.

Tests do not prove compliance with any particular website's terms. A human must review the target's terms and approve each crawl. No real prospect records are included in test fixtures.

## Latest validation (17 October 2026)

- Prisma schema validation, TypeScript type checking, ESLint, and Next.js production build passed.
- Vitest: 33 passed before the additional target-sector regression test was added, including source grounding for Lead Discovery, cent-accurate proposal pricing, pipeline accounting and contact-enrichment validation.
- Contact enrichment tests check host-bound source validation, valid contact channels and scoring without inflated automated activity. Worker tests check public JSON-LD contact extraction. On its first six-sector cycle, the deployed scheduler saved 16 source-backed review candidates (Industrial 2, FMCG 3, Logistics 3, Health 2, Tech 3, Real Estate 3). Migration and seed exited 0; the app, worker, PostgreSQL, Redis and scheduler were running.
- Python worker: 20 tests passed locally, including the new structured public contact extraction. Before this change, the Dokploy production worker passed 19 tests and a live smoke test fetched `https://example.com/` through its egress proxy, extracted with Crawl4AI, and produced one page and seven findings.
- The test target `dreamboxadvertising.co.zw` resolves to the same public IP as the Dokploy host. Outbound TCP from the worker back to that public IP times out. This is a network hairpin issue for that target, not a general worker or Redis failure.
- Proposal draft persistence and OpenAI web search should be verified in the deployed UI after the migration and current commit deploy. No outbound proposal delivery or automatic prospect import occurs.
