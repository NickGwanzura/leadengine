'use client';

import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Building2, Loader2, Search } from 'lucide-react';
import { Button } from './ui/button';
import type { DiscoveryCandidate } from '@/lib/discovery';

type Props = { existingDomains: string[]; onAdded: () => Promise<void> };

export function DiscoveryPanel({ existingDomains, onAdded }: Props) {
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('Harare, Zimbabwe');
  const [keywords, setKeywords] = useState('');
  const [service, setService] = useState('');
  const [size, setSize] = useState('');
  const [limit, setLimit] = useState(6);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [searchedAt, setSearchedAt] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true); setError(''); setCandidates([]); setSaved([]);
    try {
      const response = await fetch('/api/discovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ industry, location, keywords, service, size, limit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed');
      setCandidates(data.candidates); setSearchedAt(data.searchedAt);
    } catch (cause) { setError((cause as Error).message); }
    finally { setSearching(false); }
  }

  async function add(candidate: DiscoveryCandidate) {
    setSaving(candidate.website); setError('');
    try {
      const response = await fetch('/api/companies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: candidate.name, website: candidate.website, industry: candidate.industry || industry, city: candidate.city, country: location.includes(',') ? location.split(',').at(-1)?.trim() : 'Unspecified', source: 'Public web search', notes: `Research source: ${candidate.sourceUrl}` }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add company');
      setSaved(previous => [...previous, candidate.website]);
      await onAdded();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(''); }
  }

  return <div className="discovery-workspace">
    <section className="panel discovery-search">
      <div className="panel-heading"><div><h2>Find public business candidates</h2><p>Search results need your review before adding a company. Website audits still require separate approval.</p></div></div>
      <form onSubmit={search}>
        <div className="discovery-fields">
          <label>Industry<input required minLength={2} maxLength={100} value={industry} onChange={event => setIndustry(event.target.value)} placeholder="Real estate"/></label>
          <label>Location<input required minLength={2} maxLength={100} value={location} onChange={event => setLocation(event.target.value)} placeholder="Harare, Zimbabwe"/></label>
          <label>Keywords<input maxLength={200} value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="Property development"/></label>
          <label>Spiritus service<select value={service} onChange={event => setService(event.target.value)}><option value="">Any service</option>{['Website Development','BusinessOS','RealEstateOS','ShippingOS','SchoolOS','BillboardOS','Custom Enterprise Platforms'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Size preference<input maxLength={100} value={size} onChange={event => setSize(event.target.value)} placeholder="Optional"/></label>
          <label>Maximum results<input type="number" min={1} max={12} value={limit} onChange={event => setLimit(Number(event.target.value))}/></label>
        </div>
        <p className="discovery-disclosure">Search terms are sent to the configured OpenAI web search service. Candidates are linked to public sources and are never added automatically.</p>
        <Button disabled={searching || !industry.trim() || !location.trim()}>{searching ? <Loader2 className="spin" size={15}/> : <Search size={15}/>} {searching ? 'Searching…' : 'Search public web'}</Button>
      </form>
    </section>
    {error && <div className="error" role="alert">{error}</div>}
    {searchedAt && <section className="panel"><div className="panel-heading"><div><h2>Review candidates</h2><p>{candidates.length} sourced results · {new Date(searchedAt).toLocaleString()}</p></div></div>
      {candidates.length ? <div className="discovery-results">{candidates.map(candidate => {
        const domain = new URL(candidate.website).hostname.toLowerCase().replace(/^www\./, '');
        const isSaved = saved.includes(candidate.website) || existingDomains.includes(domain);
        return <article className="discovery-card" key={candidate.website}>
          <div className="discovery-card-heading"><span className="feature-icon"><Building2 size={18}/></span><div><h3>{candidate.name}</h3><p>{[candidate.industry, candidate.city].filter(Boolean).join(' · ')}</p></div></div>
          <p>{candidate.description}</p>
          <div className="discovery-card-links"><a href={candidate.website} target="_blank" rel="noreferrer">Website <ArrowUpRight size={13}/></a><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={13}/></a></div>
          <Button variant="outline" disabled={isSaved || Boolean(saving)} onClick={() => void add(candidate)}>{isSaved ? 'In CRM' : saving === candidate.website ? 'Adding…' : 'Add to CRM'}</Button>
        </article>;
      })}</div> : <div className="empty"><Search size={26}/><h3>No verified candidates found</h3><p>Try a broader industry or location. Only results with a public source are shown.</p></div>}
    </section>}
  </div>;
}
