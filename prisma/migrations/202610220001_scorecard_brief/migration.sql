ALTER TABLE "Organization" ADD COLUMN "weeklyTouchTarget" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "OrganizationMember" ADD COLUMN "morningBrief" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrganizationMember" ADD COLUMN "briefSentOn" TEXT;
ALTER TABLE "ProspectCompany" ADD COLUMN "segment" TEXT NOT NULL DEFAULT '';
CREATE INDEX "AuditLog_organizationId_action_createdAt_idx" ON "AuditLog"("organizationId","action","createdAt");
