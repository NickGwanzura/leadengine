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
| `/api/today` | GET | Who to contact now: due follow-ups, best uncontacted leads by score, and open deals with no contact for 14+ days; each with contact routes and the first observed website gap as an opener |
| `/api/companies/[id]/outcome` | POST | Log a contact result `{ outcome, channel }` (NO_ANSWER, INTERESTED, MEETING_BOOKED, NOT_NOW, WRONG_PERSON, NOT_INTERESTED via WHATSAPP, CALL, EMAIL, VISIT); moves the stage forward, closes open follow-ups and schedules the next touch (no answer: +3, +4, +7, +16 days, then a 90-day check-back) |
| `/api/scorecard` | GET/PATCH | Weekly contacts, replies, meetings and wins (from logged outcomes and stage changes to WON), reply rate by channel, per-target-group conversion with the current search interval; PATCH sets `weeklyTouchTarget` |
| `/api/settings/morning-brief` | GET/PATCH | The signed-in member's opt-in for a 07:30 Harare-time email of the Today list (needs Resend configured) |
| `/api/internal/morning-brief` | POST | Scheduler tick (internal bearer): sends due briefs, at most once per member per Harare day |
| `/api/settings/auto-audit` | GET/PATCH | Show or switch automatic website audits; turning them on requires `authorized: true` and records the member as approver of each automatic crawl |
| `/api/internal/auto-audit` | POST | Scheduler tick (internal bearer): queues up to five audits per workspace for never-audited companies with websites |
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
