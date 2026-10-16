type PackagePrice = { name: string; price: number | string; fromPrice: boolean; currency: string };
type Finding = { classification: string; category: string; observation: string; sourceUrl: string };

export type OpportunityCompany = {
  id: string;
  name: string;
  industry: string;
  website: string | null;
  assignedProduct?: string | null;
  audits: Array<{ createdAt: Date | string; findings: Finding[] }>;
};

export type Recommendation = {
  product: string;
  fit: 'Potential fit — confirm in discovery' | 'Website issue observed';
  evidence: Array<{ label: string; detail: string; sourceUrl?: string }>;
  businessProblem: string;
  verification: string;
  discoveryQuestion: string;
  packages: Array<{ name: string; price: string; fromPrice: boolean }>;
};

const formatPrice = (price: number | string, currency: string) =>
  `${currency} ${Number(price).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function configuredPackages(packages: PackagePrice[], names: string[]) {
  return packages
    .filter(pkg => names.includes(pkg.name))
    .map(pkg => ({ name: pkg.name, price: formatPrice(pkg.price, pkg.currency), fromPrice: pkg.fromPrice }));
}

export function recommendOpportunities(company: OpportunityCompany, packages: PackagePrice[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const industry = company.industry.toLowerCase();
  const latestAudit = company.audits[0];
  const potentialIssues = (latestAudit?.findings ?? []).filter(finding => finding.classification === 'POTENTIAL ISSUE');

  if (potentialIssues.length) {
    const uniqueIssues = [...new Map(potentialIssues.map(finding => [finding.category, finding])).values()];
    recommendations.push({
      product: 'Website development and optimization',
      fit: 'Website issue observed',
      evidence: uniqueIssues.map(finding => ({ label: finding.category, detail: finding.observation, sourceUrl: finding.sourceUrl })),
      businessProblem: 'These public-page observations may affect discoverability or mobile presentation; business impact has not been confirmed.',
      verification: 'Review the affected pages with the prospect and confirm whether the observed issue matters to their customers.',
      discoveryQuestion: 'Are these pages meeting the way your customers currently find and contact your business?',
      packages: configuredPackages(packages, ['Basic Website', 'Standard Website', 'Corporate Website']),
    });
  }

  const sectorFits: Array<{ terms: string[]; product: string; question: string }> = [
    { terms: ['real estate', 'property', 'realty'], product: 'RealEstateOS', question: 'How do you currently manage property enquiries, listings and follow-ups?' },
    { terms: ['shipping', 'logistics', 'freight', 'cargo', 'transport'], product: 'ShippingOS', question: 'How do customers request freight quotes and track shipments today?' },
    { terms: ['school', 'education', 'university', 'college'], product: 'SchoolOS', question: 'Which school administration workflows are most difficult for staff or parents?' },
    { terms: ['billboard', 'outdoor media', 'advertising'], product: 'BillboardOS', question: 'How do clients check advertising availability, book placements and receive proof of flight?' },
  ];
  const sectorFit = sectorFits.find(candidate => candidate.terms.some(term => industry.includes(term)));
  if (sectorFit) {
    recommendations.push({
      product: sectorFit.product,
      fit: 'Potential fit — confirm in discovery',
      evidence: [{ label: 'CRM industry', detail: `The company is recorded as “${company.industry}” in the CRM.` }],
      businessProblem: 'The sector can be a product fit, but no operational problem or buying intent has been established.',
      verification: 'Ask about the current process and confirm whether a platform would solve a real, prioritized need.',
      discoveryQuestion: sectorFit.question,
      packages: configuredPackages(packages, sectorFit.product === 'ShippingOS' ? ['ShippingOS'] : []),
    });
  }

  if (industry.includes('retail') || industry.includes('e-commerce') || industry.includes('ecommerce') || industry.includes('wholesale')) {
    recommendations.push({
      product: 'Online Store',
      fit: 'Potential fit — confirm in discovery',
      evidence: [{ label: 'CRM industry', detail: `The company is recorded as “${company.industry}” in the CRM.` }],
      businessProblem: 'An online sales platform may be relevant, but the company’s sales channels and needs have not been confirmed.',
      verification: 'Confirm whether the company wants online ordering and which payment, inventory and delivery workflows it needs.',
      discoveryQuestion: 'Do customers need to browse and order your products online, and what would that process need to connect to?',
      packages: configuredPackages(packages, ['Online Store']),
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      product: 'No recommendation yet',
      fit: 'Potential fit — confirm in discovery',
      evidence: [{ label: 'Research status', detail: latestAudit ? 'The latest audit did not record a potential website issue.' : 'No website audit is available yet.' }],
      businessProblem: 'There is not enough evidence to recommend a Spiritus product.',
      verification: 'Add accurate company details and, where authorized, inspect a public website before making a recommendation.',
      discoveryQuestion: 'What process would you most like to make easier for your customers or team?',
      packages: [],
    });
  }
  return recommendations;
}
