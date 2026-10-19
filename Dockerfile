FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
FROM deps AS builder
COPY . .
RUN npx prisma generate && npm run build
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/discovery/scheduler.mjs ./scheduler.mjs
COPY --from=builder --chown=nextjs:nodejs /app/discovery/runner.mjs ./runner.mjs
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","runner.mjs"]
FROM deps AS tools
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "db:migrate"]
