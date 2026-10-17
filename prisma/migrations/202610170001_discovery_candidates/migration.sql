CREATE TABLE "DiscoveryCandidate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "DiscoveryCandidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscoveryCandidate_organizationId_website_key" ON "DiscoveryCandidate"("organizationId","website");
CREATE INDEX "DiscoveryCandidate_organizationId_status_discoveredAt_idx" ON "DiscoveryCandidate"("organizationId","status","discoveredAt");
ALTER TABLE "DiscoveryCandidate" ADD CONSTRAINT "DiscoveryCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DiscoverySearchRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "DiscoverySearchRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiscoverySearchRun_organizationId_sector_startedAt_idx" ON "DiscoverySearchRun"("organizationId","sector","startedAt");
ALTER TABLE "DiscoverySearchRun" ADD CONSTRAINT "DiscoverySearchRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
