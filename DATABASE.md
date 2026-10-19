# Database

PostgreSQL is the source of truth. Prisma schema: `prisma/schema.prisma`; committed additive SQL migration: `prisma/migrations/202610150001_initial/migration.sql`.

`Organization` owns companies, imports, logs and package configurations. Users join through `OrganizationMember`; role is `ADMIN`, `MEMBER` or `VIEWER`. `ProspectCompany` is unique on `(organizationId, domain)` and carries pipeline status, public contact fields, deal estimate, notes, follow-up date and source. Domain may be null; import also compares company names within the organization. `ImportBatch` labels imported records for guarded rollback.

`CrawlJob` records the approved URL/domain, approver, queue state, attempt count, progress, lease token and error class. `WebsiteAudit` belongs to one completed job. `CrawledPage` has source URL, title, HTTP status, metadata and crawl timestamp; `AuditFinding` has classification, observation, recommendation, source URL, technical evidence and confidence. `LeadScore` holds a deterministic breakdown when scoring is added to a workflow. `DealActivity` stores timeline notes and stage transitions. `AuditLog` stores write actions. `ProductPackage` holds the editable starting prices; seed does not populate prospects.

`OutreachSend` stores a confirmed single-recipient email snapshot and provider status. `OutreachEmailEvent` stores deduplicated, signature-verified Resend event metadata. `EmailSuppression` is unique per organization and normalized email address. `OutreachUnsubscribeToken` stores only a hash of the opaque one-click unsubscribe token; public GET requests do not mutate suppression state.

All new migrations must be additive. Back up the database before deploying schema changes. Never modify applied migration SQL in place.
