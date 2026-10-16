# Architecture and scope

## Implemented slice

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn-style accessible UI primitives, Auth.js credentials, Zod validation, Prisma/PostgreSQL (Neon or local), Redis wake-ups and a separate Python Crawl4AI worker.
- Organization-scoped company CRUD (create, read, stage/follow-up/note update), CSV/XLSX import with field mapping and preview, duplicate skipping and guarded rollback.
- Durable organization-scoped follow-up tasks with assignee, company link, due date, overdue queue, completion, rescheduling, and audit records. Existing company-level follow-up dates remain visible.
- Pipeline drag and drop, overview and report metrics computed from real CRM records.
- Evidence-based opportunity workspace: deterministic score factors from recorded CRM fields, latest audit findings, interactions and scheduled follow-ups; score explanations; auditable manual overrides; product-fit hypotheses with evidence links and discovery questions. Package prices appear only when configured by the organization.
- Draft-only Outreach Studio for email, WhatsApp, LinkedIn, meeting, audit-summary and proposal-outline formats. The OpenAI-compatible provider is configurable by server environment; keys are not exposed to browsers. CRM/audit facts leave the app only after an explicit per-draft confirmation. Drafts retain supplied facts and model-listed assumptions, can be edited and copied, and are never sent automatically.
- Public-web Lead Discovery with user-entered filters, source-checked candidate review, and deliberate add-to-CRM actions. Search requires the official OpenAI Responses API and a web-search capable model.
- Organization-scoped proposal drafts with editable narrative sections, priced line items from packages editable by an administrator in Settings, an auditable save operation, and a private print/PDF view. Proposals remain drafts until reviewed and shared manually.
- Explicit per-job crawl approval, asynchronous durable PostgreSQL job states, queue limit, retries, leases, cancellation and source-backed audits.
- The worker fetches only up to three same-host HTML pages, checks robots.txt before each page, does not follow redirects or submit forms, applies rate/size/time limits and uses a DNS-pinning egress proxy. Crawl4AI extracts from fetched HTML in a browser with JavaScript disabled. Findings distinguish observed public evidence from unknown internal systems.

## Data flow

User → authenticated Next.js route → organization-scoped Prisma transaction → PostgreSQL job → Redis wake-up → Python worker claim → robots check / safe fetch / Crawl4AI extraction → authenticated internal result API → PostgreSQL audit → UI polling. PostgreSQL is the durable queue; Redis only reduces polling delay. Losing Redis wake-ups does not lose jobs.

## Later phases

The remaining master brief includes richer AI research, Resend delivery and status tracking, campaign management, OAuth, contacts and enterprise integrations. These are **not implemented** here. The proposal module offers editable drafts and browser Print / Save PDF; it does not send, sign, or track acceptance. Lead Discovery requires the configured OpenAI key and web search access. No results or contact details are invented.

## Trust boundaries

Only an authenticated organization member may read company data; writers require MEMBER or ADMIN role. Every company query and mutation is scoped to the member's organization. Auth.js signs the session cookie. Worker callbacks use a constant-time checked service secret and lease token. The worker's proxy resolves each outbound hostname and refuses non-public or mixed DNS answers before connecting to a pinned address; application-level DNS checks are a preliminary gate. The worker should additionally run under egress network policy in a production cluster; see [DEPLOYMENT.md](DEPLOYMENT.md).
