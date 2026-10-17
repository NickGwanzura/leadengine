'use client';

import { ExternalLink } from 'lucide-react';
import { categoryFor } from '@/lib/scoring';

type Finding = { id: string; category: string; sourceUrl: string; evidence: unknown };
type Company = { score?: { total: number; override: number | null; explanation: string } | null; audits: Array<{ findings: Finding[] }> };

export function AuditIntelligence({ company }: { company: Company }) {
  const score = company.score;
  const contacts = company.audits[0]?.findings.flatMap(finding => {
    if (finding.category !== 'Public contact channels' || !finding.evidence || typeof finding.evidence !== 'object' || Array.isArray(finding.evidence)) return [];
    const evidence = finding.evidence as Record<string, unknown>;
    return [...(Array.isArray(evidence.publicEmails) ? evidence.publicEmails.map(value => ({ kind: 'Email', value, sourceUrl: finding.sourceUrl })) : []), ...(Array.isArray(evidence.publicPhones) ? evidence.publicPhones.map(value => ({ kind: 'Phone', value, sourceUrl: finding.sourceUrl })) : [])].filter(item => typeof item.value === 'string');
  }) || [];
  if (!score && !contacts.length) return null;
  const effective = score?.override ?? score?.total;
  const hasPublicChannel = contacts.length > 0;
  const fitLabel = score && effective !== undefined && effective >= 60 && hasPublicChannel ? 'Strong contact candidate' : score && hasPublicChannel ? 'Public channel found · review fit' : 'Research contact route';
  return <div className="record-section audit-intelligence"><h3>Outreach fit and public contacts</h3>
    {score && <><div className="audit-fit"><strong>{effective}/100</strong><span>{categoryFor(effective!)}{score.override !== null ? ' · manually adjusted' : ' · audit-informed score'}</span></div><p><strong>{fitLabel}.</strong> {score.explanation}</p></>}
    {contacts.length > 0 && <><p className="muted">Observed on inspected public pages. Empty CRM contact fields are filled automatically; verify each channel before outreach.</p><div className="public-contacts">{contacts.map((item, index) => <div key={`${item.sourceUrl}-${item.value}-${index}`}><span>{item.kind}: {String(item.value)}</span><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={12}/></a></div>)}</div></>}
  </div>;
}
