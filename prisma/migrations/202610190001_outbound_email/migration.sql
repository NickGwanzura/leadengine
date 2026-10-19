CREATE TABLE "OutreachSend" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "senderEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "requestKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENDING',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutreachSend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachEmailEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "sendId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachEmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachUnsubscribeToken" (
  "id" TEXT NOT NULL,
  "sendId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachUnsubscribeToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutreachSend_providerMessageId_key" ON "OutreachSend"("providerMessageId");
CREATE UNIQUE INDEX "OutreachSend_organizationId_requestKey_key" ON "OutreachSend"("organizationId", "requestKey");
CREATE INDEX "OutreachSend_organizationId_createdAt_idx" ON "OutreachSend"("organizationId", "createdAt");
CREATE INDEX "OutreachSend_draftId_createdAt_idx" ON "OutreachSend"("draftId", "createdAt");
CREATE INDEX "OutreachSend_recipientEmail_status_idx" ON "OutreachSend"("recipientEmail", "status");
CREATE UNIQUE INDEX "OutreachEmailEvent_providerEventId_key" ON "OutreachEmailEvent"("providerEventId");
CREATE INDEX "OutreachEmailEvent_providerMessageId_receivedAt_idx" ON "OutreachEmailEvent"("providerMessageId", "receivedAt");
CREATE UNIQUE INDEX "EmailSuppression_organizationId_email_key" ON "EmailSuppression"("organizationId", "email");
CREATE INDEX "EmailSuppression_organizationId_createdAt_idx" ON "EmailSuppression"("organizationId", "createdAt");
CREATE UNIQUE INDEX "OutreachUnsubscribeToken_sendId_key" ON "OutreachUnsubscribeToken"("sendId");
CREATE UNIQUE INDEX "OutreachUnsubscribeToken_tokenHash_key" ON "OutreachUnsubscribeToken"("tokenHash");

ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ProspectCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachEmailEvent" ADD CONSTRAINT "OutreachEmailEvent_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "OutreachSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachUnsubscribeToken" ADD CONSTRAINT "OutreachUnsubscribeToken_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "OutreachSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
