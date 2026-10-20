ALTER TABLE "Organization" ADD COLUMN "autoAuditBy" TEXT;
ALTER TABLE "Organization" ADD COLUMN "autoAuditAt" TIMESTAMP(3);
ALTER TABLE "DiscoveryCandidate" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DiscoveryCandidate" ADD COLUMN "signals" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX "DiscoveryCandidate_organizationId_status_rank_idx" ON "DiscoveryCandidate"("organizationId","status","rank");
