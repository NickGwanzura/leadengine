'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Clock3, Loader2, RefreshCw, SearchX } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Input } from './ui/input';

type Candidate = { id: string; name: string; website: string; sourceUrl: string; description: string; industry: string; city: string; status: string; discoveredAt: string; reviewedAt: string | null };
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
  const [recentCandidates, setRecentCandidates] = useState<Candidate[]>([]);
  const [reviewedCandidates, setReviewedCandidates] = useState<Candidate[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchConfigured, setSearchConfigured] = useState<boolean | null>(null);
  const [searching, setSearching] = useState('');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [websites, setWebsites] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<string[]>([]);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/discovery/auto', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load discovery queue');
      setCandidates(data.candidates); setRecentCandidates(data.recentCandidates || []); setReviewedCandidates(data.reviewedCandidates || []); setRuns(data.runs); setSearchConfigured(data.searchConfigured); setLoadError('');
    } catch (cause) { setLoadError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timeout = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timeout); clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  async function findAll() {
    setSearching('Starting'); setError(''); setNotice('');
    const failures: string[] = [];
    let discovered = 0;
    let skipped = 0;
    for (const sector of sectors) {
      setSearching(sector);
      try {
        const response = await fetch('/api/discovery/auto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sector, force: true }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search failed');
        discovered += data.results?.[0]?.skipped ? 0 : data.results?.[0]?.discovered || 0;
        if (data.results?.[0]?.skipped) skipped++;
        await load();
      } catch (cause) { failures.push(`${sector}: ${(cause as Error).message}`); }
    }
    setSearching('');
    setNotice(`${discovered} new leads queued for review${skipped ? `; ${skipped} searches were already running` : ''}.`);
    if (failures.length) setError(failures.join(' · '));
  }
  async function review(candidate: Candidate, status: 'DISMISSED' | 'ADDED', website = '') {
    setSaving(candidate.id); setError('');
    try {
      const response = await fetch('/api/discovery/auto', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: candidate.id, status, ...(status === 'ADDED' ? { website } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update review queue');
      await load();
      if (status === 'ADDED') await onAdded();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(''); }
  }
  const lastRun = runs[0];
  return <div className="grid gap-5 pb-6">
    <Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="grid gap-2"><CardTitle>Automatic lead sourcing</CardTitle><CardDescription>Six Zimbabwe sectors searched daily. Every sourced business stays available in recent results after review.</CardDescription></div><Button variant="outline" disabled={Boolean(searching) || searchConfigured === false} onClick={() => void findAll()}>{searching ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>} {searching ? `Searching ${searching}…` : 'Run all six searches'}</Button></CardHeader>
      <CardContent className="grid gap-4 pt-0">
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-[var(--line)] p-4"><p className="text-xs text-[var(--muted)]">Awaiting review</p><strong className="mt-2 block text-2xl">{loading ? '—' : candidates.length}</strong></div><div className="rounded-lg border border-[var(--line)] p-4"><p className="text-xs text-[var(--muted)]">Recent sourced leads</p><strong className="mt-2 block text-2xl">{loading ? '—' : recentCandidates.length}</strong><p className="text-xs text-[var(--muted)]">Latest 60</p></div><div className="rounded-lg border border-[var(--line)] p-4"><p className="text-xs text-[var(--muted)]">Last search attempt</p><strong className="mt-2 block text-sm">{lastRun ? new Date(lastRun.startedAt).toLocaleString() : 'No run recorded'}</strong></div></div>
        {searchConfigured === false && <Alert variant="destructive"><AlertTitle>Search is not configured</AlertTitle><AlertDescription>Set AI_API_KEY and the official OpenAI API endpoint in the app container, then redeploy.</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertTitle>Search or review failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {loadError && <Alert variant="destructive"><AlertTitle>Could not load sourcing results</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}
        {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
        {!loading && runs.length === 0 && <Alert variant="destructive"><AlertTitle>No scheduled search has reached this workspace</AlertTitle><AlertDescription>Check the app container logs in Dokploy for discovery-scheduler messages and confirm the Spiritus workspace has been seeded.</AlertDescription></Alert>}
        {lastRun && Date.now() - new Date(lastRun.startedAt).getTime() > 26 * 3600000 && <Alert variant="destructive"><AlertTitle>Scheduler is overdue</AlertTitle><AlertDescription>No search attempt has been recorded in over 26 hours. Check the app container logs in Dokploy.</AlertDescription></Alert>}
        {runs.some(run => run.status === 'RUNNING' && Date.now() - new Date(run.startedAt).getTime() > 2 * 60000) && <Alert variant="destructive"><AlertTitle>A search appears stalled</AlertTitle><AlertDescription>A sector has been running for over two minutes. Check the app container logs, then use Run all six searches to retry.</AlertDescription></Alert>}
      </CardContent></Card>

    <Card><CardHeader><CardTitle>Sector search results</CardTitle><CardDescription>Newest recorded attempt for each sector. A completed search with zero means it found no new verified companies.</CardDescription></CardHeader><CardContent className="grid gap-3 pt-0 sm:grid-cols-2 xl:grid-cols-3">{sectors.map(sector => { const run = runs.find(item => item.sector === sector); return <div key={sector} className="rounded-lg border border-[var(--line)] p-4"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{sector}</strong><Badge variant={!run ? 'outline' : run.status === 'FAILED' ? 'destructive' : run.status === 'COMPLETED' ? 'secondary' : 'outline'}>{!run ? 'No run' : run.status.toLowerCase()}</Badge></div><p className="mt-3 text-sm">{run ? `${run.resultCount} new lead${run.resultCount === 1 ? '' : 's'}` : 'No result yet'}</p><p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]"><Clock3 size={12}/>{run ? new Date(run.startedAt).toLocaleString() : 'Waiting for scheduler'}</p>{run?.status === 'FAILED' && <p className="mt-2 text-xs text-red-700">{run.error || 'Search failed'}</p>}</div>; })}</CardContent></Card>

    <Card><CardHeader><CardTitle>Leads awaiting review</CardTitle><CardDescription>{candidates.length} sourced companies. Verify each website before adding it to the CRM.</CardDescription></CardHeader>{!loading && candidates.length === 0 ? <CardContent className="flex items-start gap-3 pt-0 text-sm text-[var(--muted)]"><SearchX size={19}/><p>No leads currently await review. Check the sector results and recent sourced leads below.</p></CardContent> : <CardContent className="grid gap-3 pt-0 md:grid-cols-2">{candidates.map(candidate => {
      const website = websites[candidate.id] ?? suggestedWebsite(candidate);
      const domain = websiteDomain(website);
      const inCrm = existingNames.some(name => name.trim().toLowerCase() === candidate.name.trim().toLowerCase()) || Boolean(domain && existingDomains.includes(domain));
      return <div className="rounded-lg border border-[var(--line)] p-4" key={candidate.id}><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{candidate.name}</h3><p className="mt-1 text-xs text-[var(--muted)]">{candidate.industry} · {candidate.city || 'Zimbabwe'} · {new Date(candidate.discoveredAt).toLocaleDateString()}</p></div><Badge variant="outline">New</Badge></div><p className="mt-3 text-sm text-[var(--muted)]">{candidate.description}</p><div className="mt-3 flex gap-4 text-sm text-[var(--accent)]"><a className="inline-flex items-center gap-1" href={candidate.website} target="_blank" rel="noreferrer">Suggested page <ArrowUpRight size={13}/></a><a className="inline-flex items-center gap-1" href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={13}/></a></div><label className="mt-4 grid gap-2 text-xs text-[var(--muted)]">Verified business website<Input type="url" value={website} onChange={event => { setWebsites(previous => ({ ...previous, [candidate.id]: event.target.value })); setReviewed(previous => previous.filter(id => id !== candidate.id)); }} placeholder="Leave blank if only a directory listing is known"/></label><label className="mt-3 flex items-start gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={reviewed.includes(candidate.id)} onChange={event => setReviewed(previous => event.target.checked ? [...previous, candidate.id] : previous.filter(id => id !== candidate.id))}/><span>I reviewed this company and website.</span></label><div className="mt-4 flex items-center gap-3"><Button variant="outline" disabled={Boolean(saving) || inCrm || !reviewed.includes(candidate.id) || domain === null} onClick={() => void review(candidate, 'ADDED', website)}>{inCrm ? 'Already in CRM' : saving === candidate.id ? 'Saving…' : 'Add to CRM'}</Button><Button variant="ghost" disabled={Boolean(saving)} onClick={() => void review(candidate, 'DISMISSED')}>Dismiss</Button></div></div>;
    })}</CardContent>}</Card>

    <Card><CardHeader><CardTitle>Recent sourced leads</CardTitle><CardDescription>Previously reviewed results remain visible here with their original public sources.</CardDescription></CardHeader><CardContent className="grid gap-2 pt-0">{reviewedCandidates.length ? reviewedCandidates.map(candidate => <div key={candidate.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] px-4 py-3"><div className="min-w-0 flex-1"><strong className="text-sm">{candidate.name}</strong><p className="text-xs text-[var(--muted)]">{candidate.industry} · {candidate.city || 'Zimbabwe'} · Found {new Date(candidate.discoveredAt).toLocaleDateString()}</p></div><Badge variant={candidate.status === 'ADDED' ? 'secondary' : 'outline'}>{candidate.status === 'ADDED' ? 'Added to CRM' : 'Dismissed'}</Badge><a className="inline-flex items-center gap-1 text-xs text-[var(--accent)]" href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a></div>) : <p className="text-sm text-[var(--muted)]">No reviewed leads yet. New candidates appear above after a search.</p>}</CardContent></Card>
  </div>;
}
