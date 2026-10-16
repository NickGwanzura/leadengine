# Testing

Run `npm ci`, `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Worker source can be syntax checked with `PYTHONPYCACHEPREFIX=/tmp/leados-pycache python3 -m compileall -q worker`; install `worker/requirements.txt` and run `pytest worker/tests` for security and evidence classification tests.

For an end-to-end smoke test on a Docker host: build and start Compose, run the seed profile, sign in, create a company with a controlled public website, approve the crawl, watch QUEUED → RUNNING → COMPLETED, inspect source URLs and audit classifications, cancel a queued job, import a small CSV and roll it back before editing the imported records. Inspect the worker and app logs for blocked private addresses and redirects.

Tests do not prove compliance with any particular website's terms. A human must review the target's terms and approve each crawl. No real prospect records are included in test fixtures.

## Latest local validation (16 October 2026)

- Prisma schema validation and deterministic migration diff: passed.
- TypeScript type checking: passed after the production build completed.
- ESLint: passed.
- Vitest: 20 passed.
- Python pytest: 16 passed.
- Next.js production build (`--webpack`): passed; all app and API routes compiled.
- Production dependency audit (`npm audit --omit=dev`): zero reported advisories after patched transitive overrides.
- Compose YAML parse: passed. Docker/Compose execution: untested because Docker is unavailable on this machine.
- HTTP smoke check: `/login` returned 200, `/` redirected to `/login`, unauthenticated `/api/companies` returned 401. The login page was inspected in a browser at a narrow viewport.
- A live PostgreSQL/Redis/Crawl4AI integration run remains untested locally. PostgreSQL initialization was blocked by the local sandbox's shared-memory restriction, and Docker is not installed. Run the Docker-host smoke test above before production use.
