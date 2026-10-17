# API

All browser write routes require an Auth.js session, organization membership and same-origin request. The internal worker route uses `Authorization: Bearer <INTERNAL_API_SECRET>` and job leases. Errors return JSON `{ "error": "..." }`.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | Credentials sign-in and session handling |
| `/api/companies` | GET/POST | Organization companies; create validated company |
| `/api/companies/:id` | PATCH | Edit company details and website, stage, notes, follow-up or timeline activity |
| `/api/companies/import` | POST | Import mapped JSON rows after client CSV/XLSX preview; maximum 500 rows |
| `/api/companies/import` | DELETE | Roll back a batch only if its companies have no subsequent changes |
| `/api/discovery` | POST | Search public web for source-checked candidate companies; review before CRM import |
| `/api/discovery/auto` | GET/POST/PATCH | Review saved sector candidates, run one sector search, or dismiss/mark reviewed; daily scheduler uses the internal bearer secret |
| `/api/packages` | GET/PATCH | Read and update organization package prices; updates require ADMIN |
| `/api/proposals` | GET/POST | List and create organization-scoped proposal drafts |
| `/api/proposals/:id` | PATCH | Edit an existing draft and replace its priced line items |
| `/proposals/:id` | GET | Private proposal preview for browser Print / Save PDF |
| `/api/reports?days=7\|30\|90` | GET | Organization-scoped pipeline snapshot and selected-period research counts |
| `/api/crawls` | POST | Authorize and queue a public website crawl for a company |
| `/api/crawls/:id` | DELETE | Cancel an active job |
| `/api/internal/jobs` | POST | Worker `claim`, `progress`, `complete`, `fail` protocol |
| `/api/health` | GET | PostgreSQL and Redis readiness |

The company import request is `{ "rows": [{ "name": "...", "website": "https://...", "industry": "..." }] }`; response includes `batchId`, `created`, `duplicates`. Crawl request is `{ "companyId": "...", "authorized": true }`. The worker uses a lease token from `claim`; stale or cancelled leases cannot complete.

Automatic discovery POST accepts one of Industrial, FMCG, Logistics, Health, Tech or Real Estate as `{ "sector": "..." }`. Searches are capped at three cited candidates per sector and deduplicated against existing CRM companies. A successful search within the prior 20 hours is reused. Candidates remain in a review queue until explicitly added or dismissed.
