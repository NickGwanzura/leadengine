'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

type Candidate = { id: string; name: string; website: string; sourceUrl: string; description: string; industry: string; city: string; discoveredAt: string };
type Run = { id: string; sector: string; status: string; resultCount: number; startedAt: string; error: string | null };
const sectors = ['Industrial', 'FMCG', 'Logistics', 'Health', 'Tech', 'Real Estate'];
function suggestedWebsite(candidate: Candidate) {
  const website = new URL(candidate.website);
  const source = new URL(candidate.sourceUrl);
  return website.hostname === source.hostname && website.pathname.split('/').filter(Boolean).length > 1 ? '' : candidate.website;
}
function websiteDomain(raw: string) {
  if (!raw) return '';
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.hostname.toLowerCase().replace(/^www\./, '') : null; } catch { return null; }
}

export function AutoDiscoveryPanel({ existingDomains, existingNames, onAdded }: { existingDomains: string[]; existingNames: string[]; onAdded: () => Promise<void> }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState('');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [websites, setWebsites] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<string[]>([]);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/discovery/auto');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load discovery queue');
      setCandidates(data.candidates); setRuns(data.runs); setError('');
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  async function findAll() {
    setSearching('Starting'); setError('');
    const failures: string[] = [];
    for (const sector of sectors) {
      setSearching(sector);
      try {
        const response = await fetch('/api/discovery/auto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sector }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search failed');
        await load();
      } catch (cause) { failures.push(`${sector}: ${(cause as Error).message}`); }
    }
    setSearching('');
    if (failures.length) setError(failures.join(' · '));
  }
  async function review(candidate: Candidate, status: 'DISMISSED' | 'ADDED', website = '') {
    setSaving(candidate.id); setError('');
    try {
      if (status === 'ADDED') {
        const response = await fetch('/api/companies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: candidate.name, website, industry: candidate.industry, city: candidate.city, country: 'Zimbabwe', source: 'Automatic public web discovery', notes: `Research source: ${candidate.sourceUrl}` }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not add company');
        await onAdded();
      }
      const response = await fetch('/api/discovery/auto', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: candidate.id, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update review queue');
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(''); }
  }
  return <section className="panel auto-discovery"><div className="panel-heading"><div><h2>Automatic sector discovery</h2><p>Daily public-web searches across Industrial, FMCG, Logistics, Health, Tech and Real Estate in Zimbabwe. Sourced candidates wait here for review; none are added or crawled automatically.</p></div></div>
    <div className="auto-discovery-controls"><Button variant="outline" disabled={Boolean(searching)} onClick={() => void findAll()}>{searching ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>} {searching ? `Searching ${searching}…` : 'Find leads across all six sectors'}</Button><span>{loading ? 'Loading queue…' : `${candidates.length} awaiting review`}</span></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {runs.length > 0 && <p className="auto-discovery-status">Latest searches: {sectors.map(sector => { const run = runs.find(item => item.sector === sector); return `${sector} ${run ? run.status.toLowerCase() : 'pending'}`; }).join(' · ')}</p>}
    <div className="discovery-results">{candidates.map(candidate => {
      const website = websites[candidate.id] ?? suggestedWebsite(candidate);
      const domain = websiteDomain(website);
      const inCrm = existingNames.some(name => name.trim().toLowerCase() === candidate.name.trim().toLowerCase()) || Boolean(domain && existingDomains.includes(domain));
      return <article className="discovery-card" key={candidate.id}><div className="discovery-card-heading"><div><h3>{candidate.name}</h3><p>{candidate.industry} · {candidate.city || 'Zimbabwe'} · {new Date(candidate.discoveredAt).toLocaleDateString()}</p></div></div><p>{candidate.description}</p><div className="discovery-card-links"><a href={candidate.website} target="_blank" rel="noreferrer">Suggested page <ArrowUpRight size={13}/></a><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={13}/></a></div><label className="discovery-website-label">Verified business website<input type="url" value={website} onChange={event => { setWebsites(previous => ({ ...previous, [candidate.id]: event.target.value })); setReviewed(previous => previous.filter(id => id !== candidate.id)); }} placeholder="Leave blank if only a directory listing is known"/></label><label className="discovery-confirm"><input type="checkbox" checked={reviewed.includes(candidate.id)} onChange={event => setReviewed(previous => event.target.checked ? [...previous, candidate.id] : previous.filter(id => id !== candidate.id))}/><span>I reviewed this company and website.</span></label><div className="auto-discovery-actions"><Button variant="outline" disabled={Boolean(saving) || inCrm || !reviewed.includes(candidate.id) || domain === null} onClick={() => void review(candidate, 'ADDED', website)}>{inCrm ? 'Already in CRM' : saving === candidate.id ? 'Saving…' : 'Add to CRM'}</Button><button className="text-button" disabled={Boolean(saving)} onClick={() => void review(candidate, 'DISMISSED')}>Dismiss</button></div></article>;
    })}</div>
  </section>;
}
