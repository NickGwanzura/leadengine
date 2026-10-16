# Spiritus LeadOS

Evidence-led B2B prospect research for Spiritus Systems. This repository implements the **first working vertical slice** of the larger product brief: secure team sign-in, company CRM and CSV/XLSX import, pipeline and follow-ups, authorised public website crawling, persisted evidence and audit review. The remaining modules are explicitly identified in [ARCHITECTURE.md](ARCHITECTURE.md).

## Dokploy quick start

1. Push this repository to a private Git repository. In Dokploy create a **Docker Compose** service from the repository with `compose.neon.yaml` for Neon PostgreSQL or `compose.yaml` for self-hosted PostgreSQL at the repository root. Choose Docker Compose mode, not Docker Stack mode. The app service listens internally on port `3000`.
2. Add the variables from `.env.example` in Dokploy's Environment panel. Generate independent random values for `REDIS_PASSWORD`, `AUTH_SECRET` and `INTERNAL_API_SECRET` (at least 32 characters each). The self-hosted PostgreSQL stack also needs `POSTGRES_PASSWORD`. Set `AUTH_URL=https://leados.your-domain` to the exact public origin. For Neon, set `NEON_DATABASE_URL` to your unpooled connection string. Set `ADMIN_EMAIL` and a unique password of at least 12 characters for provisioning.
3. Deploy. The `migrate` service applies the committed SQL migration before the application starts. Attach your HTTPS domain to the `app` service on port `3000`. Do not publish the worker, Redis, PostgreSQL or internal API directly.
4. From the Dokploy host, run `docker compose -f compose.neon.yaml --profile tools run --rm seed` (or substitute `compose.yaml`) with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set. The seed command creates the first administrator and editable package prices; it creates **no demo prospects**. Repeat the command to restore membership if necessary; it does not reset an existing password.
5. Sign in and add a company. Check the authorisation box in its record to queue a crawl. Results appear after the worker completes. Review the sources before drawing conclusions.

For local Compose, copy `.env.example` to `.env`, set secrets and `AUTH_URL=http://localhost:3000`, then run `docker compose -f compose.yaml -f compose.local.yaml up -d --build`. Provision the admin with `docker compose --profile tools run --rm seed`. For local Node development, supply PostgreSQL and Redis URLs and run `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`, `npm run dev`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for operational checks and backups, [DATABASE.md](DATABASE.md) for data ownership, [API.md](API.md) for endpoints, and [TESTING.md](TESTING.md) for validation.
