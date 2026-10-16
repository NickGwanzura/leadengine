# Architecture and scope

## Implemented slice

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn-style accessible UI primitives, Auth.js credentials, Zod validation, Prisma/PostgreSQL (Neon or local), Redis wake-ups and a separate Python Crawl4AI worker.
- Organization-scoped company CRUD (create, read, stage/follow-up/note update), CSV/XLSX import with field mapping and preview, duplicate skipping and guarded rollback.
- Pipeline drag and drop, task list, overview and report metrics computed from real CRM records.
- Explicit per-job crawl approval, asynchronous durable PostgreSQL job states, queue limit, retries, leases, cancellation and source-backed audits.
- The worker fetches only up to three same-host HTML pages, checks robots.txt before each page, does not follow redirects or submit forms, applies rate/size/time limits and uses a DNS-pinning egress proxy. Crawl4AI extracts from fetched HTML in a browser with JavaScript disabled. Findings distinguish observed public evidence from unknown internal systems.

## Data flow

User → authenticated Next.js route → organization-scoped Prisma transaction → PostgreSQL job → Redis wake-up → Python worker claim → robots check / safe fetch / Crawl4AI extraction → authenticated internal result API → PostgreSQL audit → UI polling. PostgreSQL is the durable queue; Redis only reduces polling delay. Losing Redis wake-ups does not lose jobs.

## Later phases

The full master brief also calls for public search discovery, opportunity recommendations, LLM abstraction, outreach and Resend sending, proposals and PDF output, campaign management, richer scoring, OAuth, contacts and enterprise integrations. These are **not implemented** here. Their navigation is disabled or the UI clearly marks them as future work. No results or contact details are invented.

## Trust boundaries

Only an authenticated organization member may read company data; writers require MEMBER or ADMIN role. Every company query and mutation is scoped to the member's organization. Auth.js signs the session cookie. Worker callbacks use a constant-time checked service secret and lease token. The worker's proxy resolves each outbound hostname and refuses non-public or mixed DNS answers before connecting to a pinned address; application-level DNS checks are a preliminary gate. The worker should additionally run under egress network policy in a production cluster; see [DEPLOYMENT.md](DEPLOYMENT.md).
