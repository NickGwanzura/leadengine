'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Loader2, Pause, Pencil, Play, Plus, Radar, RefreshCw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Input } from './ui/input';

type Segment = { name: string; industry: string; location: string; keywords: string; painPoint: string; service: string };
type Profile = { website: string; summary: string; services: { name: string; description: string }[]; segments: Segment[]; pages: { url: string; title: string }[]; status: string; error: string | null; active: boolean; analysedAt: string | null };
const blankSegment: Segment = { name: '', industry: '', location: 'Zimbabwe', keywords: '', painPoint: '', service: '' };
const segmentFields: { key: keyof Segment; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Segment name', placeholder: 'Growing logistics firms' },
  { key: 'industry', label: 'Industry to search', placeholder: 'Logistics' },
  { key: 'location', label: 'Location', placeholder: 'Harare, Zimbabwe' },
  { key: 'keywords', label: 'Keywords', placeholder: 'freight, clearing agents' },
  { key: 'service', label: 'Service that fits', placeholder: 'ShippingOS' },
  { key: 'painPoint', label: 'Problem you solve for them', placeholder: 'Manual shipment tracking' },
];

async function send(method: string, body?: unknown) {
  const response = await fetch('/api/discovery/profile', { method, cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
  return data;
}

export function LeadEnginePanel({ onPlanChanged }: { onPlanChanged: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [website, setWebsite] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Segment[] | null>(null);

  const load = useCallback(async () => {
    try { const data = await send('GET'); setProfile(data.profile); setAiConfigured(data.aiConfigured); setWebsite(current => current || data.profile?.website || ''); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  async function analyse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalysing(true); setError(''); setDraft(null);
    try { const data = await send('POST', { website }); setProfile(data.profile); onPlanChanged(); }
    catch (cause) { setError((cause as Error).message); await load(); }
    finally { setAnalysing(false); }
  }
  async function update(body: { active?: boolean; segments?: Segment[] }) {
    setSaving(true); setError('');
    try { const data = await send('PATCH', body); setProfile(data.profile); setDraft(null); onPlanChanged(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }
  const editSegment = (index: number, key: keyof Segment, value: string) => setDraft(previous => previous && previous.map((segment, i) => i === index ? { ...segment, [key]: value } : segment));
  const segments = draft ?? profile?.segments ?? [];
  const draftValid = !draft || (draft.length > 0 && draft.every(segment => segment.name.trim().length >= 2 && segment.industry.trim().length >= 2 && segment.location.trim().length >= 2));

  const analyseForm = <form className="flex flex-col gap-2 sm:flex-row" onSubmit={analyse}>
    <Input aria-label="Your business website" value={website} onChange={event => setWebsite(event.target.value)} placeholder="yourcompany.co.zw" required disabled={analysing}/>
    <Button className="shrink-0" disabled={analysing || !website.trim() || !aiConfigured}>{analysing ? <Loader2 size={15} className="spin"/> : profile ? <RefreshCw size={15}/> : <Sparkles size={15}/>}{analysing ? 'Reading your website…' : profile ? 'Re-analyse' : 'Analyse my business'}</Button>
  </form>;

  if (loading) return <Card><CardContent className="flex items-center gap-2 py-6 text-sm text-[var(--muted)]"><Loader2 size={15} className="spin"/> Loading your lead engine…</CardContent></Card>;

  return <Card className="lead-engine">
    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid gap-2">
        <CardTitle className="flex items-center gap-2"><Radar size={18}/> Lead engine</CardTitle>
        <CardDescription>{profile ? 'Built from your website. Each target below is searched on the public web around the clock, and new matches land in your review queue.' : 'Enter your website. LeadOS reads what you sell, works out which businesses need it, and keeps searching for them 24/7.'}</CardDescription>
      </div>
      {profile && profile.segments.length > 0 && <div className="flex shrink-0 items-center gap-2">
        <Badge variant={profile.active ? 'default' : 'secondary'} className="gap-1.5">{profile.active && <span className="live-dot"/>}{profile.active ? 'Searching 24/7' : 'Paused'}</Badge>
        <Button variant="outline" disabled={saving} onClick={() => void update({ active: !profile.active })}>{profile.active ? <Pause size={14}/> : <Play size={14}/>}{profile.active ? 'Pause' : 'Resume'}</Button>
      </div>}
    </CardHeader>
    <CardContent className="grid gap-5 pt-0">
      {!aiConfigured && <Alert variant="destructive"><AlertTitle>AI is not configured</AlertTitle><AlertDescription>Set AI_API_KEY in the app container to analyse your website and search for leads.</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertTitle>Something went wrong</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {analysing && <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={14} className="spin"/> Reading your homepage and service pages, then building target customer segments. This usually takes 20–40 seconds.</p>}
      {!profile ? analyseForm : <>
        <div className="grid gap-3 rounded-lg border border-[var(--line)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">What you sell</span>{profile.analysedAt && <span className="text-xs text-[var(--muted)]">Analysed {new Date(profile.analysedAt).toLocaleString()}</span>}</div>
          {profile.status === 'FAILED' && profile.error && <p className="text-sm text-red-700">Last analysis failed: {profile.error}{profile.segments.length ? ' Your previous targets are still being searched.' : ''}</p>}
          {profile.summary && <p className="text-sm leading-relaxed">{profile.summary}</p>}
          {profile.services.length > 0 && <div className="flex flex-wrap gap-1.5">{profile.services.map(service => <Badge key={service.name} variant="outline" title={service.description}>{service.name}</Badge>)}</div>}
          {profile.pages.length > 0 && <details className="text-xs text-[var(--muted)]"><summary className="cursor-pointer">{profile.pages.length} page{profile.pages.length === 1 ? '' : 's'} analysed</summary><div className="mt-2 grid gap-1">{profile.pages.map(page => <a key={page.url} className="inline-flex items-center gap-1 text-[var(--accent)]" href={page.url} target="_blank" rel="noreferrer">{page.title || page.url}<ExternalLink size={11}/></a>)}</div></details>}
          {analyseForm}
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold">Who to find · {segments.length} target{segments.length === 1 ? '' : 's'}</h3><p className="text-xs text-[var(--muted)]">Edit these to steer the search. Changes apply from the next search.</p></div>
            {draft ? <div className="flex gap-2"><Button variant="ghost" disabled={saving} onClick={() => setDraft(null)}><X size={14}/> Cancel</Button><Button disabled={saving || !draftValid} onClick={() => void update({ segments: draft })}>{saving ? <Loader2 size={14} className="spin"/> : <Save size={14}/>} Save targets</Button></div>
              : <Button variant="outline" onClick={() => setDraft(profile.segments)}><Pencil size={14}/> Edit targets</Button>}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {segments.map((segment, index) => draft ? <div key={index} className="grid gap-2 rounded-lg border border-[var(--accent)]/40 p-4">
              <div className="grid gap-2 sm:grid-cols-2">{segmentFields.map(field => <label key={field.key} className={`grid gap-1 text-xs text-[var(--muted)] ${field.key === 'painPoint' ? 'sm:col-span-2' : ''}`}>{field.label}<Input value={segment[field.key]} placeholder={field.placeholder} onChange={event => editSegment(index, field.key, event.target.value)}/></label>)}</div>
              <Button variant="ghost" className="w-fit text-red-700" disabled={draft.length <= 1} onClick={() => setDraft(draft.filter((_, i) => i !== index))}><Trash2 size={14}/> Remove</Button>
            </div> : <div key={segment.name} className="rounded-lg border border-[var(--line)] p-4">
              <div className="flex items-start justify-between gap-2"><strong className="text-sm">{segment.name}</strong>{segment.service && <Badge variant="secondary">{segment.service}</Badge>}</div>
              <p className="mt-1 text-xs text-[var(--muted)]">{segment.industry} · {segment.location}</p>
              {segment.painPoint && <p className="mt-3 text-sm">{segment.painPoint}</p>}
              {segment.keywords && <p className="mt-2 text-xs text-[var(--muted)]">Keywords: {segment.keywords}</p>}
            </div>)}
          </div>
          {draft && draft.length < 8 && <Button variant="outline" className="w-fit" onClick={() => setDraft([...draft, { ...blankSegment }])}><Plus size={14}/> Add a target</Button>}
        </div>
      </>}
    </CardContent>
  </Card>;
}
