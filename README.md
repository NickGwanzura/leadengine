# Spiritus LeadOS

Evidence-led B2B prospect research for Spiritus Systems. This repository implements secure team sign-in, company CRM and CSV/XLSX import, pipeline and follow-ups, authorised public website crawling, persisted evidence and audit review, source-backed Lead Discovery, outreach drafts and print-ready proposal drafts. The remaining modules are explicitly identified in [ARCHITECTURE.md](ARCHITECTURE.md).

## Dokploy quick start

1. Push this repository to a private Git repository. In Dokploy create a **Docker Compose** service from the repository with `compose.neon.yaml` for Neon PostgreSQL or `compose.yaml` for self-hosted PostgreSQL at the repository root. Choose Docker Compose mode, not Docker Stack mode. The app service listens internally on port `3000`.
2. Add the variables from `.env.example` in Dokploy's Environment panel. Generate independent random values for `REDIS_PASSWORD`, `AUTH_SECRET` and `INTERNAL_API_SECRET` (at least 32 characters each). The self-hosted PostgreSQL stack also needs `POSTGRES_PASSWORD`. Set `AUTH_URL=https://leados.your-domain` to the exact public origin. For Neon, set `NEON_DATABASE_URL` to your unpooled connection string. Set `ADMIN_EMAIL` and a unique password of at least 12 characters for provisioning.
3. Deploy. The `migrate` service applies the committed SQL migration, then the `seed` service provisions the first administrator and editable package prices before the application starts. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters in Dokploy. The seed is idempotent and does not reset an existing password or create **demo prospects**. Attach your HTTPS domain to the `app` service on port `3000`. Do not publish the worker, Redis, PostgreSQL or internal API directly.
4. Sign in and add a company. Check the authorisation box in its record to queue a crawl. Results appear after the worker completes. Review the sources before drawing conclusions.

For local Compose, copy `.env.example` to `.env`, set secrets and `AUTH_URL=http://localhost:3000`, then run `docker compose -f compose.yaml -f compose.local.yaml up -d --build`. The seed service runs before the app. For local Node development, supply PostgreSQL and Redis URLs and run `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`, `npm run dev`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for operational checks and backups, [DATABASE.md](DATABASE.md) for data ownership, [API.md](API.md) for endpoints, and [TESTING.md](TESTING.md) for validation.
