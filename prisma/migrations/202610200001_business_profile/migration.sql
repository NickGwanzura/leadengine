CREATE TABLE "BusinessProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "services" JSONB NOT NULL DEFAULT '[]',
  "segments" JSONB NOT NULL DEFAULT '[]',
  "pages" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ANALYSING',
  "error" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "analysedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessProfile_organizationId_key" ON "BusinessProfile"("organizationId");
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryCandidate" ADD COLUMN "segment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DiscoveryCandidate" ADD COLUMN "fitReason" TEXT NOT NULL DEFAULT '';
