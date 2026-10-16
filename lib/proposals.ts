import { z } from 'zod';

const paragraph = z.string().trim().max(10000).default('');
export const proposalInput = z.object({
  companyId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  summary: paragraph,
  objectives: paragraph,
  confirmedChallenges: paragraph,
  scope: paragraph,
  deliverables: paragraph,
  phases: paragraph,
  timeline: paragraph,
  paymentMilestones: paragraph,
  hostingMaintenance: paragraph,
  exclusions: paragraph,
  terms: paragraph,
  items: z.array(z.object({ description: z.string().trim().min(2).max(300), quantity: z.number().int().min(1).max(1000), unitPrice: z.number().min(0).max(100000000).multipleOf(0.01) })).min(1).max(30),
});

export type ProposalInput = z.infer<typeof proposalInput>;

export function proposalTotalCents(items: ProposalInput['items']) {
  return items.reduce((total, item) => total + Math.round(item.unitPrice * 100) * item.quantity, 0);
}
