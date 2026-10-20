'use client';

import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Building2, Loader2, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Input } from './ui/input';
import type { DiscoveryCandidate } from '@/lib/discovery';

type Props = { existingDomains: string[]; existingNames: string[]; onAdded: () => Promise<void> };
const candidateKey = (candidate: DiscoveryCandidate) => `${candidate.name}|${candidate.sourceUrl}`;
function suggestedWebsite(candidate: DiscoveryCandidate) {
  const website = new URL(candidate.website);
  const source = new URL(candidate.sourceUrl);
  // A deep page on the same source host is often a directory listing, not the business's website.
  return website.hostname === source.hostname && website.pathname.split('/').filter(Boolean).length > 1 ? '' : candidate.website;
}
function websiteDomain(raw: string) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return null; }
}

export function DiscoveryPanel({ existingDomains, existingNames, onAdded }: Props) {
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
  const [websites, setWebsites] = useState<Record<string,string>>({});
  const [verified, setVerified] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true); setError(''); setCandidates([]); setSaved([]); setWebsites({}); setVerified([]);
    try {
      const response = await fetch('/api/discovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ industry, location, keywords, service, size, limit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed');
      setCandidates(data.candidates); setSearchedAt(data.searchedAt);
    } catch (cause) { setError((cause as Error).message); }
    finally { setSearching(false); }
  }

  async function add(candidate: DiscoveryCandidate, key: string, website: string) {
    setSaving(key); setError('');
    try {
      const response = await fetch('/api/companies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: candidate.name, website, industry: candidate.industry || industry, city: candidate.city, country: location.includes(',') ? location.split(',').at(-1)?.trim() : 'Unspecified', source: 'Public web search', notes: [`Research source: ${candidate.sourceUrl}`, candidate.fitReason && `Why they may fit: ${candidate.fitReason}`].filter(Boolean).join('\n') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add company');
      setSaved(previous => [...previous, key]);
      await onAdded();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(''); }
  }

  return <div className="grid gap-5">
    <Card>
      <CardHeader><CardTitle>Search for specific businesses</CardTitle><CardDescription>Search results need your review before adding a company. Website audits require separate approval.</CardDescription></CardHeader>
      <CardContent className="pt-0"><form className="grid gap-4" onSubmit={search}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-2 text-xs text-[var(--muted)]">Industry<Input required minLength={2} maxLength={100} value={industry} onChange={event => setIndustry(event.target.value)} placeholder="Real estate"/></label>
          <label className="grid gap-2 text-xs text-[var(--muted)]">Location<Input required minLength={2} maxLength={100} value={location} onChange={event => setLocation(event.target.value)} placeholder="Harare, Zimbabwe"/></label>
          <label className="grid gap-2 text-xs text-[var(--muted)]">Keywords<Input maxLength={200} value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="Property development"/></label>
          <label className="grid gap-2 text-xs text-[var(--muted)]">Spiritus service<select className="h-10 w-full" value={service} onChange={event => setService(event.target.value)}><option value="">Any service</option>{['Website Development','BusinessOS','RealEstateOS','ShippingOS','SchoolOS','BillboardOS','Custom Enterprise Platforms'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-2 text-xs text-[var(--muted)]">Size preference<Input maxLength={100} value={size} onChange={event => setSize(event.target.value)} placeholder="Optional"/></label>
          <label className="grid gap-2 text-xs text-[var(--muted)]">Maximum results<Input type="number" min={1} max={12} value={limit} onChange={event => setLimit(Number(event.target.value))}/></label>
        </div>
        <p className="text-xs text-[var(--muted)]">Search terms are sent to the configured OpenAI web search service. Candidates are linked to public sources and are never added automatically.</p>
        <Button className="w-fit" disabled={searching || !industry.trim() || !location.trim()}>{searching ? <Loader2 className="spin" size={15}/> : <Search size={15}/>} {searching ? 'Searching…' : 'Search public web'}</Button>
      </form></CardContent>
    </Card>
    {error && <Alert variant="destructive"><AlertTitle>Search failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {searchedAt && <Card><CardHeader><CardTitle>Review search results</CardTitle><CardDescription>{candidates.length} sourced results · {new Date(searchedAt).toLocaleString()}</CardDescription></CardHeader>
      {candidates.length ? <CardContent className="grid gap-3 pt-0 md:grid-cols-2">{candidates.map(candidate => {
        const key = candidateKey(candidate);
        const website = websites[key] ?? suggestedWebsite(candidate);
        const domain = websiteDomain(website);
        const isSaved = saved.includes(key) || existingNames.some(name => name.trim().toLowerCase() === candidate.name.trim().toLowerCase()) || Boolean(domain && existingDomains.includes(domain));
        return <article className="rounded-lg border border-[var(--line)] p-4" key={key}>
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Building2 size={18}/><div><h3 className="text-sm font-semibold">{candidate.name}</h3><p className="text-xs text-[var(--muted)]">{[candidate.industry, candidate.city].filter(Boolean).join(' · ')}</p></div></div><Badge variant="outline">Source checked</Badge></div>
          <p className="mt-3 text-sm text-[var(--muted)]">{candidate.description}</p>
          {candidate.fitReason && <p className="mt-2 rounded-md bg-[var(--accent)]/5 px-3 py-2 text-sm"><strong className="font-medium">Why they may fit: </strong>{candidate.fitReason}</p>}
          <div className="mt-3 flex gap-4 text-sm text-[var(--accent)]"><a className="inline-flex items-center gap-1" href={candidate.website} target="_blank" rel="noreferrer">Suggested page <ArrowUpRight size={13}/></a><a className="inline-flex items-center gap-1" href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={13}/></a></div>
          <label className="mt-4 grid gap-2 text-xs text-[var(--muted)]">Verified business website<Input type="url" value={website} onChange={event => { setWebsites(previous => ({ ...previous, [key]: event.target.value })); setVerified(previous => previous.filter(value => value !== key)); }} placeholder="Leave blank if only a directory listing is known"/></label>
          <label className="mt-3 flex items-start gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={verified.includes(key)} onChange={event => setVerified(previous => event.target.checked ? [...previous, key] : previous.filter(value => value !== key))}/><span>I reviewed this candidate and its website field.</span></label>
          <Button variant="outline" disabled={isSaved || Boolean(saving) || !verified.includes(key) || domain === null} onClick={() => void add(candidate, key, website)}>{isSaved ? 'In CRM' : saving === key ? 'Adding…' : 'Add to CRM'}</Button>
        </article>;
      })}</CardContent> : <CardContent className="flex items-start gap-3 pt-0 text-sm text-[var(--muted)]"><Search size={20}/><p>No verified candidates found. Try a broader industry or location.</p></CardContent>}
    </Card>}
  </div>;
}
