# API

All browser write routes require an Auth.js session, organization membership and same-origin request. The internal worker route uses `Authorization: Bearer <INTERNAL_API_SECRET>` and job leases. Errors return JSON `{ "error": "..." }`.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | Credentials sign-in and session handling |
| `/api/companies` | GET/POST | Organization companies; create validated company |
| `/api/companies/:id` | PATCH | Stage, notes, follow-up or timeline activity |
| `/api/companies/import` | POST | Import mapped JSON rows after client CSV/XLSX preview; maximum 500 rows |
| `/api/companies/import` | DELETE | Roll back a batch only if its companies have no subsequent changes |
| `/api/crawls` | POST | Authorize and queue a public website crawl for a company |
| `/api/crawls/:id` | DELETE | Cancel an active job |
| `/api/internal/jobs` | POST | Worker `claim`, `progress`, `complete`, `fail` protocol |
| `/api/health` | GET | PostgreSQL and Redis readiness |

The company import request is `{ "rows": [{ "name": "...", "website": "https://...", "industry": "..." }] }`; response includes `batchId`, `created`, `duplicates`. Crawl request is `{ "companyId": "...", "authorized": true }`. The worker uses a lease token from `claim`; stale or cancelled leases cannot complete.
