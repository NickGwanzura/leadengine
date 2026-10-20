'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, BellRing, CalendarClock, Loader2, Mail, MessageCircle, Phone, PartyPopper, Sparkles, Snowflake } from 'lucide-react';
import { Button } from './ui/button';
import { openingMessage, outcomeLabels, whatsappNumber, type Channel, type Outcome } from '@/lib/sales-cadence';

type Item = {
  kind: 'due' | 'new' | 'quiet';
  reason: string;
  task: { id: string; title: string; type: string; dueAt: string } | null;
  company: { id: string; name: string; domain: string | null; website: string | null; industry: string; city: string; stage: string; phone: string | null; email: string | null; contactPerson: string | null };
  score: number | null;
  touches: number;
  hook: string | null;
  pitch: { service: string; painPoint: string } | null;
};
type Today = { due: Item[]; newLeads: Item[]; goneQuiet: Item[] };
const outcomeOrder: Outcome[] = ['NO_ANSWER', 'INTERESTED', 'MEETING_BOOKED', 'NOT_NOW', 'WRONG_PERSON', 'NOT_INTERESTED'];
const groups: { key: keyof Today; title: string; empty: string; icon: typeof CalendarClock }[] = [
  { key: 'due', title: 'Follow-ups due', empty: 'No follow-ups due today.', icon: CalendarClock },
  { key: 'newLeads', title: 'Best new leads', empty: 'No uncontacted leads. Add some from Lead Discovery.', icon: Sparkles },
  { key: 'goneQuiet', title: 'Gone quiet', empty: 'No open deals have gone quiet.', icon: Snowflake },
];

async function send(url: string, body?: unknown) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
  return data;
}

// Opt-in email of this list at 07:30 Harare time, sent through the server's Resend configuration.
function BriefToggle() {
  const [state, setState] = useState<{ enabled: boolean; configured: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const timeout = setTimeout(() => { void fetch('/api/settings/morning-brief', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(setState); }, 0); return () => clearTimeout(timeout); }, []);
  if (!state) return null;
  async function update(enabled: boolean) {
    setSaving(true); setError('');
    const response = await fetch('/api/settings/morning-brief', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setState(body); else setError(body.error || 'Could not change the morning brief');
    setSaving(false);
  }
  return <div className="brief-toggle">
    <BellRing size={15}/>
    <span>{state.enabled ? 'Morning brief on: this list is emailed to you at 07:30.' : state.configured ? 'Get this list by email every morning at 07:30.' : 'The morning brief needs outbound email (Resend) configured on the server.'}</span>
    {state.configured && <button className="text-button" disabled={saving} onClick={() => void update(!state.enabled)}>{state.enabled ? 'Turn off' : 'Turn on'}</button>}
    {error && <span className="field-error">{error}</span>}
  </div>;
}

export function TodayPanel({ user, onOpenCompany, onChanged }: { user: string; onOpenCompany: (id: string) => void; onChanged: () => void }) {
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [done, setDone] = useState<Record<string, string>>({});
  // The channel last used per company, so the outcome is logged against how you actually reached out.
  const [channelFor, setChannelFor] = useState<Record<string, Channel>>({});

  const load = useCallback(async () => {
    try { setToday(await send('/api/today')); setError(''); } catch (cause) { setError((cause as Error).message); }
  }, []);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  async function logOutcome(item: Item, outcome: Outcome) {
    const id = item.company.id;
    const channel = channelFor[id] ?? (whatsappNumber(item.company.phone) ? 'WHATSAPP' : item.company.phone ? 'CALL' : 'EMAIL');
    setSaving(id); setError('');
    try {
      const result = await send(`/api/companies/${id}/outcome`, { outcome, channel });
      setDone(previous => ({ ...previous, [id]: `${outcomeLabels[outcome]} · ${result.summary}` }));
      onChanged();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(''); }
  }

  if (!today) return <section className="panel empty">{error ? <p className="field-error">{error}</p> : <><Loader2 className="spin" size={22}/><p>Building today’s list…</p></>}</section>;
  const total = today.due.length + today.newLeads.length + today.goneQuiet.length;

  return <div className="today">
    <BriefToggle/>
    <div className="today-summary">
      {groups.map(({ key, title, icon: Icon }) => <div key={key}><Icon size={16}/><span>{title}</span><strong>{today[key].length}</strong></div>)}
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {!total && <section className="panel empty"><PartyPopper size={26}/><h3>You’re all caught up</h3><p>Nothing due and no new leads waiting. The lead engine keeps searching; new leads appear here once you add them to the CRM.</p></section>}
    {groups.map(({ key, title, empty, icon: Icon }) => today[key].length > 0 && <section className="panel" key={key}>
      <div className="panel-heading"><div className="heading-inline"><Icon size={17}/><h2>{title}</h2><span className="count-pill">{today[key].length}</span></div></div>
      {today[key].length ? today[key].map(item => {
        const { company } = item;
        const wa = whatsappNumber(company.phone);
        const message = openingMessage({ company: company.name, sender: user, domain: company.domain, hook: item.hook, service: item.pitch?.service, industry: company.industry });
        const logged = done[company.id];
        const setChannel = (channel: Channel) => setChannelFor(previous => ({ ...previous, [company.id]: channel }));
        return <article className={`today-row ${logged ? 'is-done' : ''}`} key={`${key}-${company.id}-${item.task?.id ?? ''}`}>
          <div className="today-main">
            <button className="company-cell" onClick={() => onOpenCompany(company.id)}><span className="avatar">{company.name.slice(0, 2).toUpperCase()}</span><span><strong>{company.name}</strong><small>{[company.industry, company.city, company.contactPerson].filter(Boolean).join(' · ')}</small></span></button>
            <div className="today-meta">
              {item.score !== null && <span className="today-score" title="Lead score">{item.score}<small>/100</small></span>}
              <span className={`status ${item.kind === 'new' ? '' : 'positive'}`}>{item.kind === 'new' ? 'New' : company.stage.toLowerCase()}</span>
              {item.touches > 0 && <span className="muted">{item.touches} touch{item.touches === 1 ? '' : 'es'}</span>}
            </div>
          </div>
          <p className={`today-reason ${item.reason.startsWith('Overdue') ? 'overdue' : ''}`}>{item.reason}</p>
          {(item.hook || item.pitch) && <p className="today-hook">{item.hook && <><strong>Opening:</strong> {item.hook}</>}{item.pitch && <span className="today-pitch">{item.hook ? ' · ' : ''}<strong>Pitch:</strong> {item.pitch.service}{item.pitch.painPoint ? ` (${item.pitch.painPoint.replace(/\.$/, '')})` : ''}</span>}</p>}
          {logged ? <p className="today-logged">✓ {logged}</p> : <div className="today-actions">
            <div className="today-contact">
              {wa && <a className="button button-whatsapp" href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" onClick={() => setChannel('WHATSAPP')}><MessageCircle size={15}/> WhatsApp</a>}
              {company.phone && <a className="button button-outline" href={`tel:${company.phone.replace(/\s+/g, '')}`} onClick={() => setChannel('CALL')}><Phone size={15}/> Call</a>}
              {company.email && <a className="button button-outline" href={`mailto:${company.email}?subject=${encodeURIComponent(`${company.name} × Spiritus Systems`)}&body=${encodeURIComponent(message)}`} onClick={() => setChannel('EMAIL')}><Mail size={15}/> Email</a>}
              {!company.phone && !company.email && <Button variant="outline" onClick={() => onOpenCompany(company.id)}><ArrowUpRight size={15}/> Find a contact</Button>}
            </div>
            <div className="today-outcomes" role="group" aria-label={`Log the result for ${company.name}`}>
              <span>Result{channelFor[company.id] ? ` (${channelFor[company.id].toLowerCase()})` : ''}:</span>
              {outcomeOrder.map(outcome => <button key={outcome} className={`chip ${outcome === 'NOT_INTERESTED' ? 'chip-danger' : outcome === 'INTERESTED' || outcome === 'MEETING_BOOKED' ? 'chip-success' : ''}`} disabled={saving === company.id} onClick={() => void logOutcome(item, outcome)}>{outcomeLabels[outcome]}</button>)}
            </div>
          </div>}
        </article>;
      }) : <p className="panel-body">{empty}</p>}
    </section>)}
  </div>;
}
