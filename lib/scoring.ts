export const limits = { fit: 25, opportunity: 20, relationship: 20, commercial: 15, accessibility: 10, engagement: 10 } as const;

export type ScoreFactor = keyof typeof limits;

export function scoreLead(input: Partial<Record<ScoreFactor, number>>) {
  const breakdown = Object.fromEntries(
    Object.entries(limits).map(([key, max]) => [key, Math.max(0, Math.min(max, input[key as ScoreFactor] || 0))]),
  ) as Record<ScoreFactor, number>;
  const total = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  return { total, breakdown, category: categoryFor(total) };
}

export function categoryFor(total: number) {
  return total >= 80 ? 'High priority' : total >= 60 ? 'Strong opportunity' : total >= 40 ? 'Nurture' : 'Low priority';
}

export type ScoringCompany = {
  industry: string;
  assignedProduct?: string | null;
  stage: string;
  dealValue: number | string | { toString(): string };
  sizeEstimate?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  contactPosition?: string | null;
  notes?: string | null;
  nextFollowUp?: Date | string | null;
  activities?: Array<{ createdAt: Date | string; type?: string }>;
  followUpTasks?: Array<{ dueAt: Date | string }>;
  audits?: Array<{
    createdAt: Date | string;
    findings: Array<{ classification: string; category: string }>;
  }>;
};

export type ScoreResult = ReturnType<typeof scoreLead> & { explanation: string };

const fitKeywords: Record<string, string[]> = {
  realEstate: ['real estate', 'property', 'realty'],
  shipping: ['shipping', 'logistics', 'freight', 'cargo', 'transport'],
  school: ['school', 'education', 'university', 'college'],
  billboard: ['advertising', 'billboard', 'outdoor media'],
  commerce: ['retail', 'ecommerce', 'e-commerce', 'wholesale', 'store'],
  financial: ['finance', 'financial', 'insurance', 'bank'],
  industrial: ['industrial', 'manufacturing', 'factory', 'mining'],
  fmcg: ['fmcg', 'consumer goods', 'food and beverage'],
  health: ['health', 'medical', 'clinic', 'hospital', 'pharma'],
  technology: ['technology', 'software', 'tech', 'it services'],
};

export function scoreProspect(company: ScoringCompany, now = new Date()): ScoreResult {
  const industry = company.industry.trim().toLowerCase();
  const matchedCategory = Object.entries(fitKeywords).find(([, terms]) => terms.some(term => industry.includes(term)));
  const fit = company.assignedProduct ? 18 : matchedCategory ? 16 : industry && industry !== 'unclassified' ? 10 : 0;

  const findings = company.audits?.[0]?.findings ?? [];
  const potentialIssueCategories = [...new Set(findings
    .filter(finding => finding.classification === 'POTENTIAL ISSUE')
    .map(finding => finding.category))];
  const opportunity = Math.min(limits.opportunity, potentialIssueCategories.length * 5);

  const humanActivities = (company.activities ?? []).filter(activity => activity.type !== 'AUDIT_COMPLETED');
  const activityCount = humanActivities.length;
  const relationship = Math.min(limits.relationship,
    (company.notes?.trim() ? 4 : 0) + Math.min(activityCount * 3, 12) + (company.assignedProduct ? 4 : 0));

  const dealValue = Number(company.dealValue.toString());
  const commercial = Math.min(limits.commercial,
    (Number.isFinite(dealValue) && dealValue > 0 ? 8 : 0) + (company.sizeEstimate?.trim() ? 4 : 0) + (company.assignedProduct ? 3 : 0));

  const accessibility = Math.min(limits.accessibility,
    (company.email?.trim() ? 3 : 0) + (company.phone?.trim() ? 2 : 0) + (company.contactPerson?.trim() ? 3 : 0) + (company.contactPosition?.trim() ? 2 : 0));

  const stagePoints: Record<string, number> = {
    'NEW LEAD': 0, RESEARCHED: 2, QUALIFIED: 4, CONTACTED: 5, 'MEETING BOOKED': 6,
    'DISCOVERY COMPLETED': 7, 'PROPOSAL SENT': 8, NEGOTIATION: 9, WON: 10, LOST: 0,
  };
  const followUpAt = company.nextFollowUp ? new Date(company.nextFollowUp) : null;
  const hasUpcomingFollowUp = Boolean((followUpAt && followUpAt >= now) || company.followUpTasks?.some(task => new Date(task.dueAt) >= now));
  const recentActivity = humanActivities.some(activity => now.getTime() - new Date(activity.createdAt).getTime() <= 30 * 86400000);
  const engagement = Math.min(limits.engagement, (stagePoints[company.stage] ?? 0) + (hasUpcomingFollowUp ? 1 : 0) + (recentActivity ? 1 : 0));

  const result = scoreLead({ fit, opportunity, relationship, commercial, accessibility, engagement });
  const evidence = [
    matchedCategory ? `Industry entered in CRM matches ${matchedCategory[0]} product fit.` : company.assignedProduct ? `Assigned product in CRM: ${company.assignedProduct}.` : industry && industry !== 'unclassified' ? 'Industry is recorded, but no configured product fit matched it.' : 'Industry is not classified, so product fit remains unscored.',
    potentialIssueCategories.length ? `Latest audit recorded potential issues in: ${potentialIssueCategories.join(', ')}.` : 'No potential website issues were recorded in the latest audit; no digital opportunity points were assumed.',
    `CRM relationship context: ${activityCount} recorded activities${company.notes?.trim() ? ' and saved notes' : ''}.`,
    Number.isFinite(dealValue) && dealValue > 0 ? 'Commercial points use the deal value entered by the team.' : 'No deal value was entered, so commercial value was not inferred.',
    `Contact access is based on fields recorded in CRM${company.email || company.phone || company.contactPerson ? '.' : '; no contact details were entered.'}`,
    `Engagement uses the recorded pipeline stage${hasUpcomingFollowUp ? ' and an upcoming follow-up task' : ''}${recentActivity ? ' and recent recorded activity.' : '.'}`,
  ];
  return { ...result, explanation: evidence.join(' ') };
}
