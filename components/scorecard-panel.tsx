'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gauge, Loader2, Pencil, Save } from 'lucide-react';
import { Button } from './ui/button';

type Week = { weekStart: string; touches: number; responses: number; meetings: number; wins: number };
type Segment = { name: string; leads: number; contacted: number; responded: number; meetings: number; won: number; multiplier: number };
type Scorecard = { weeklyTouchTarget: number; weeks: Week[]; channels: { channel: string; touches: number; responses: number }[]; segments: Segment[]; learning: boolean; refreshHours: number; minContactedOverall: number; minContactedPerSegment: number };
const percent = (part: number, whole: number) => whole ? `${Math.round(part / whole * 100)}%` : '—';
const channelLabels: Record<string, string> = { WHATSAPP: 'WhatsApp', CALL: 'Call', EMAIL: 'Email', VISIT: 'Visit' };
const weekLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Harare' });

export function ScorecardPanel() {
  const [data, setData] = useState<Scorecard | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/scorecard', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load the scorecard');
      setData(body); setError('');
    } catch (cause) { setError((cause as Error).message); }
  }, []);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  async function saveTarget() {
    const value = Number(editing);
    if (!Number.isInteger(value) || value < 1) { setError('Weekly target must be a whole number above zero'); return; }
    const response = await fetch('/api/scorecard', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ weeklyTouchTarget: value }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || 'Could not save the target'); return; }
    setEditing(null); await load();
  }

  if (!data) return <section className="panel scorecard"><div className="panel-heading">{error ? <p className="field-error">{error}</p> : <p className="muted"><Loader2 className="spin" size={15}/> Loading scorecard…</p>}</div></section>;
  const week = data.weeks.at(-1)!;
  const progress = Math.min(100, Math.round(week.touches / data.weeklyTouchTarget * 100));
  const maxTouches = Math.max(1, ...data.weeks.map(row => row.touches));

  return <section className="panel scorecard">
    <div className="panel-heading">
      <div><h2 className="heading-inline"><Gauge size={17}/> Weekly scorecard</h2><p>Contacts, replies, meetings and wins from results logged on Today. Weeks start Monday, Harare time.</p></div>
    </div>
    {error && <div className="error scorecard-error" role="alert">{error}</div>}
    <div className="scorecard-week">
      <div className="scorecard-target">
        <div className="scorecard-target-head"><span>Contacts this week</span>{editing === null ? <button className="text-button" onClick={() => setEditing(String(data.weeklyTouchTarget))}><Pencil size={13}/> Target {data.weeklyTouchTarget}</button> : <span className="scorecard-target-edit"><input type="number" min={1} max={1000} aria-label="Weekly contact target" value={editing} onChange={event => setEditing(event.target.value)}/><Button variant="outline" onClick={() => void saveTarget()}><Save size={13}/> Save</Button></span>}</div>
        <strong>{week.touches}<small> / {data.weeklyTouchTarget}</small></strong>
        <div className="bar-track"><div style={{ width: `${progress}%` }}/></div>
      </div>
      <div><span>Reply rate</span><strong>{percent(week.responses, week.touches)}</strong><small>{week.responses} replies</small></div>
      <div><span>Meetings</span><strong>{week.meetings}</strong><small>booked this week</small></div>
      <div><span>Wins</span><strong>{week.wins}</strong><small>moved to Won</small></div>
    </div>
    <div className="scorecard-grid">
      <div className="scorecard-block">
        <h3>Last {data.weeks.length} weeks</h3>
        <table><thead><tr><th>Week</th><th>Contacts</th><th>Replies</th><th>Meetings</th><th>Wins</th></tr></thead>
          <tbody>{data.weeks.map(row => <tr key={row.weekStart}><td>{weekLabel(row.weekStart)}</td><td><span className="mini-bar"><i style={{ width: `${row.touches / maxTouches * 100}%` }}/></span>{row.touches}</td><td>{row.responses} <small className="muted">{percent(row.responses, row.touches)}</small></td><td>{row.meetings}</td><td>{row.wins}</td></tr>)}</tbody></table>
      </div>
      <div className="scorecard-block">
        <h3>By channel</h3>
        {data.channels.length ? <table><thead><tr><th>Channel</th><th>Contacts</th><th>Reply rate</th></tr></thead><tbody>{data.channels.map(row => <tr key={row.channel}><td>{channelLabels[row.channel] ?? row.channel}</td><td>{row.touches}</td><td>{percent(row.responses, row.touches)}</td></tr>)}</tbody></table> : <p className="muted">Log results on Today to compare WhatsApp, calls and email.</p>}
      </div>
    </div>
    <div className="scorecard-block scorecard-segments">
      <h3>Target groups</h3>
      <p className="muted">{data.learning ? 'The lead engine now searches groups that convert more often and weak groups less often.' : `Search frequency adapts once ${data.minContactedOverall}+ leads are contacted across at least two groups (${data.minContactedPerSegment}+ each). Until then every group is searched every ${data.refreshHours} hours.`}</p>
      {data.segments.length ? <div className="table-wrap"><table><thead><tr><th>Group</th><th>Leads</th><th>Contacted</th><th>Replied</th><th>Meetings</th><th>Won</th><th>Searched</th></tr></thead>
        <tbody>{data.segments.map(row => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.leads}</td><td>{row.contacted}</td><td>{row.responded} <small className="muted">{percent(row.responded, row.contacted)}</small></td><td>{row.meetings}</td><td>{row.won}</td><td><span className={`status ${row.multiplier < 1 ? 'won' : row.multiplier > 1 ? 'lost' : ''}`}>every {Math.round(data.refreshHours * row.multiplier * 10) / 10}h</span></td></tr>)}</tbody></table></div>
        : <p className="muted">No companies from lead engine groups yet. Leads you add from Lead Discovery are tracked here by group.</p>}
    </div>
  </section>;
}
