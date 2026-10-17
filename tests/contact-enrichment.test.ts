import { describe, expect, it } from 'vitest';
import { publicContactCandidates } from '../lib/contact-enrichment';
import { scoreProspect } from '../lib/scoring';

describe('audit enrichment', () => {
  it('accepts only valid public channels from the approved audit host', () => {
    const contacts = publicContactCandidates([
      { category: 'Public contact channels', classification: 'VERIFIED', sourceUrl: 'https://example.com/contact', evidence: { publicEmails: ['sales@gmail.com', 'hello@example.com', 'invalid'], publicPhones: ['+263 77 123 4567', 'javascript:bad'] } },
      { category: 'Public contact channels', classification: 'VERIFIED', sourceUrl: 'https://other.example/contact', evidence: { publicEmails: ['wrong@other.example'] } },
    ], 'example.com');
    expect(contacts.email).toEqual({ value: 'hello@example.com', sourceUrl: 'https://example.com/contact' });
    expect(contacts.phone?.value).toBe('+263 77 123 4567');
    expect(contacts.emails).toHaveLength(2);
  });

  it('does not treat automated audit activity as a relationship signal', () => {
    const score = scoreProspect({ industry: 'Unclassified', stage: 'NEW LEAD', dealValue: 0, activities: [{ type: 'AUDIT_COMPLETED', createdAt: new Date() }] });
    expect(score.breakdown.relationship).toBe(0);
    expect(score.breakdown.engagement).toBe(0);
  });

  it('recognizes a requested target sector in the fit breakdown', () => {
    const score = scoreProspect({ industry: 'Industrial manufacturing', stage: 'NEW LEAD', dealValue: 0 });
    expect(score.breakdown.fit).toBe(16);
  });
});
