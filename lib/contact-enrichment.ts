import { z } from 'zod';

type ContactFinding = { category: string; classification: string; sourceUrl: string; evidence: unknown };

export function publicContactCandidates(findings: ContactFinding[], approvedDomain: string) {
  const emails: Array<{ value: string; sourceUrl: string }> = [];
  const phones: Array<{ value: string; sourceUrl: string }> = [];
  for (const finding of findings) {
    if (finding.category !== 'Public contact channels' || finding.classification !== 'VERIFIED') continue;
    try { if (new URL(finding.sourceUrl).hostname !== approvedDomain) continue; } catch { continue; }
    if (!finding.evidence || typeof finding.evidence !== 'object' || Array.isArray(finding.evidence)) continue;
    const evidence = finding.evidence as Record<string, unknown>;
    for (const raw of Array.isArray(evidence.publicEmails) ? evidence.publicEmails : []) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim().toLowerCase();
      if (value.length <= 254 && z.email().safeParse(value).success && !emails.some(item => item.value === value)) emails.push({ value, sourceUrl: finding.sourceUrl });
    }
    for (const raw of Array.isArray(evidence.publicPhones) ? evidence.publicPhones : []) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (value.length <= 50 && /^\+?[0-9][0-9 .()/-]{5,49}$/.test(value) && !phones.some(item => item.value === value)) phones.push({ value, sourceUrl: finding.sourceUrl });
    }
  }
  const domainEmail = emails.find(item => item.value.split('@')[1] === approvedDomain.replace(/^www\./, ''));
  return { email: domainEmail || emails[0] || null, phone: phones[0] || null, emails, phones };
}
