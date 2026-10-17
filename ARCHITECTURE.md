# Architecture and scope

## Implemented slice

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn-style accessible UI primitives, Auth.js credentials, Zod validation, Prisma/PostgreSQL (Neon or local), Redis wake-ups and a separate Python Crawl4AI worker.
- Organization-scoped company CRUD (create, read, edit website and details, stage/follow-up/note update), CSV/XLSX import with field mapping and preview, duplicate skipping and guarded rollback.
- Durable organization-scoped follow-up tasks with assignee, company link, due date, overdue queue, completion, rescheduling, and audit records. Existing company-level follow-up dates remain visible.
- Pipeline drag and drop, overview and organization-scoped reports computed from real CRM records. Reports separate open pipeline from recorded won deal value and show current stages, sources, industries, due tasks, proposals and recent research activity.
- Evidence-based opportunity workspace: deterministic score factors from recorded CRM fields, latest audit findings, interactions and scheduled follow-ups; score explanations; auditable manual overrides; product-fit hypotheses with evidence links and discovery questions. Package prices appear only when configured by the organization.
- Draft-only Outreach Studio for email, WhatsApp, LinkedIn, meeting, audit-summary and proposal-outline formats. The OpenAI-compatible provider is configurable by server environment; keys are not exposed to browsers. CRM/audit facts leave the app only after an explicit per-draft confirmation. Drafts retain supplied facts and model-listed assumptions, can be edited and copied, and are never sent automatically.
- Public-web Lead Discovery with user-entered filters, source-checked candidate review, and deliberate add-to-CRM actions. Search requires the official OpenAI Responses API and a web-search capable model. A member must review each result and confirm or clear its website field before adding it to the CRM; directory listings are not treated as official company websites.
- A separate daily discovery scheduler searches Zimbabwean businesses in Industrial, FMCG, Logistics, Health, Tech and Real Estate, capped at three cited results per sector. It stores candidates in a review queue; it does not create CRM records or queue crawls. The team can also rerun all sectors from Lead Discovery.
- Organization-scoped proposal drafts with editable narrative sections, priced line items from packages editable by an administrator in Settings, an auditable save operation, and a private print/PDF view. Proposals remain drafts until reviewed and shared manually.
- Explicit per-job crawl approval, asynchronous durable PostgreSQL job states, queue limit, retries, leases, cancellation and source-backed audits.
- Completed audits enrich previously empty business email and phone fields only from public mailto/tel links or structured business contact data on the approved host. Every observed channel retains its source page in the audit. Completion recalculates the lead score from the new audit and CRM evidence while preserving any manual score override.
- The worker fetches only up to three same-host HTML pages, checks robots.txt before each page, does not follow redirects or submit forms, applies rate/size/time limits and uses a DNS-pinning egress proxy. Crawl4AI extracts from fetched HTML in a browser with JavaScript disabled. Findings distinguish observed public evidence from unknown internal systems.

## Data flow

User → authenticated Next.js route → organization-scoped Prisma transaction → PostgreSQL job → Redis wake-up → Python worker claim → robots check / safe fetch / Crawl4AI extraction → authenticated internal result API → PostgreSQL audit → UI polling. PostgreSQL is the durable queue; Redis only reduces polling delay. Losing Redis wake-ups does not lose jobs.

## Later phases

The remaining master brief includes richer AI research, Resend delivery and status tracking, campaign management, OAuth, contacts and enterprise integrations. These are **not implemented** here. The proposal module offers editable drafts and browser Print / Save PDF; it does not send, sign, or track acceptance. Lead Discovery requires the configured OpenAI key and web search access. No results or contact details are invented.

## Trust boundaries

Only an authenticated organization member may read company data; writers require MEMBER or ADMIN role. Every company query and mutation is scoped to the member's organization. Auth.js signs the session cookie. Worker callbacks use a constant-time checked service secret and lease token. The worker's proxy resolves each outbound hostname and refuses non-public or mixed DNS answers before connecting to a pinned address; application-level DNS checks are a preliminary gate. The worker should additionally run under egress network policy in a production cluster; see [DEPLOYMENT.md](DEPLOYMENT.md).
