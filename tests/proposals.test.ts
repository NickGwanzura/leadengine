import { describe, expect, it } from 'vitest';
import { proposalInput, proposalTotalCents } from '../lib/proposals';

const draft = {
  companyId: 'company-1', title: 'Website proposal', summary: 'Agreed summary',
  objectives: '', confirmedChallenges: '', scope: '', deliverables: '', phases: '',
  timeline: '', paymentMilestones: '', hostingMaintenance: '', exclusions: '', terms: '',
  items: [{ description: 'Discovery', quantity: 2, unitPrice: 149.99 }],
};

describe('proposal draft pricing', () => {
  it('validates cents and calculates the total in integer cents', () => {
    const parsed = proposalInput.parse(draft);
    expect(proposalTotalCents(parsed.items)).toBe(29998);
  });
  it('rejects unsupported fractional cents and empty line items', () => {
    expect(proposalInput.safeParse({ ...draft, items: [{ description: 'Audit', quantity: 1, unitPrice: 10.001 }] }).success).toBe(false);
    expect(proposalInput.safeParse({ ...draft, items: [] }).success).toBe(false);
  });
});
