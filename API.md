# API

All browser write routes require an Auth.js session, organization membership and same-origin request. The internal worker route uses `Authorization: Bearer <INTERNAL_API_SECRET>` and job leases. Errors return JSON `{ "error": "..." }`.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | Credentials sign-in and session handling |
| `/api/companies` | GET/POST | Organization companies; create validated company. `?view=summary` returns the lightweight polling shape without audits or timeline entries and supports `If-None-Match` |
| `/api/companies/:id` | GET/PATCH | Read one company with its latest audit, timeline and follow-ups; edit details and website, stage, notes, follow-up or timeline activity |
| `/api/companies/import` | POST | Import mapped JSON rows after client CSV/XLSX preview; maximum 500 rows |
| `/api/companies/import` | DELETE | Roll back a batch only if its companies have no subsequent changes |
| `/api/discovery` | POST | Search public web for source-checked candidate companies; review before CRM import |
| `/api/discovery/profile` | GET/POST/PATCH | Read the lead engine profile, analyse the business website into services and target segments, or pause/resume searching and edit segments |
| `/api/discovery/auto` | GET/POST/PATCH | Review saved candidates, run one target search, or dismiss/mark reviewed; the scheduler sends `{ "next": true }` with the internal bearer secret |
| `/api/packages` | GET/PATCH | Read and update organization package prices; updates require ADMIN |
| `/api/proposals` | GET/POST | List and create organization-scoped proposal drafts |
| `/api/proposals/:id` | PATCH | Edit an existing draft and replace its priced line items |
| `/proposals/:id` | GET | Private proposal preview for browser Print / Save PDF |
| `/api/reports?days=7\|30\|90` | GET | Organization-scoped pipeline snapshot and selected-period research counts |
| `/api/crawls` | POST | Authorize and queue a public website crawl for a company |
| `/api/crawls/:id` | DELETE | Cancel an active job |
| `/api/internal/jobs` | POST | Worker `claim`, `progress`, `complete`, `fail` protocol |
| `/api/outreach/status` | GET | Report sender, postal-address and webhook configuration without exposing secrets |
| `/api/outreach/sends` | GET/POST | List send history or send one explicitly confirmed saved email draft |
| `/api/webhooks/resend` | POST | Verify signed Resend events and update send status and suppression records |
| `/api/outreach/unsubscribe` | GET/POST | Confirm unsubscribe or process a one-click opt-out using an opaque token |
| `/api/health` | GET | PostgreSQL and Redis readiness |

`GET /api/companies?view=summary` omits `audits`, `activities` and `followUpTasks`, keeps the latest job and audit count, and returns `ETag` with `Cache-Control: private, no-cache` so repeat polls revalidate to `304`. The workspace polls this view every 8 seconds while an audit is queued or running and every 60 seconds otherwise; the drawer loads full detail from `/api/companies/:id`.

The company import request is `{ "rows": [{ "name": "...", "website": "https://...", "industry": "..." }] }`; response includes `batchId`, `created`, `duplicates`. Crawl request is `{ "companyId": "...", "authorized": true }`. The worker uses a lease token from `claim`; stale or cancelled leases cannot complete.

Lead engine: POST `/api/discovery/profile` with `{ "website": "yourcompany.co.zw" }` reads the homepage and up to four same-site service/about pages (every redirect hop is checked for public addresses) and asks the configured AI provider for a summary, services and up to eight target customer segments. Members can edit segments or set `{ "active": false }` to pause. Automatic discovery searches those segments; without an analysed profile it falls back to the six default Zimbabwe sectors (Industrial, FMCG, Logistics, Health, Tech, Real Estate). The scheduler ticks every `DISCOVERY_INTERVAL_MINUTES` (default 10) and runs the single most overdue target per workspace; a completed target is repeated after `DISCOVERY_REFRESH_HOURS` (default 6), a failed one after 15 minutes. Each search stores up to five new cited candidates with the segment and a source-based fit reason, deduplicated against the CRM and previously sourced candidates. A member POST of `{ "sector": "<segment name>", "force": true }` runs one target now. Candidates remain in a review queue until explicitly added or dismissed.
