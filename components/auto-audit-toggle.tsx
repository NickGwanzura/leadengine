'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from './ui/button';

type State = { enabled: boolean; enabledBy: string | null; enabledAt: string | null; pending: number };

// Switching auto-audit on records this member as the approver of every automatic public-website audit.
export function AutoAuditToggle({ onChanged }: { onChanged: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/settings/auto-audit', { cache: 'no-store' });
    if (response.ok) setState(await response.json());
  }, []);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  async function update(enabled: boolean) {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/settings/auto-audit', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled, authorized: enabled ? authorized : undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not change automatic audits');
      setMessage(enabled ? `Automatic audits on. ${data.queued} queued now; the rest follow every 10 minutes.` : 'Automatic audits off.');
      setAuthorized(false); await load(); onChanged();
    } catch (cause) { setMessage((cause as Error).message); }
    finally { setSaving(false); }
  }

  if (!state) return null;
  return <div className={`auto-audit ${state.enabled ? 'is-on' : ''}`}>
    <div className="auto-audit-head">
      <span className="auto-audit-icon"><Zap size={16}/></span>
      <div>
        <strong>Automatic audits {state.enabled ? 'on' : 'off'}</strong>
        <p>{state.enabled ? `Every lead with a website is audited and re-ranked automatically. Approved by ${state.enabledBy || 'a team member'}${state.enabledAt ? ` on ${new Date(state.enabledAt).toLocaleDateString()}` : ''}. ${state.pending} waiting.` : `Audit new leads as soon as they reach the CRM, so they are ranked on website evidence. ${state.pending} companies have never been audited.`}</p>
      </div>
      {state.enabled && <Button variant="outline" disabled={saving} onClick={() => void update(false)}>{saving && <Loader2 size={14} className="spin"/>}Turn off</Button>}
    </div>
    {!state.enabled && <div className="auto-audit-confirm">
      <label className="checkbox-label"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)}/><span>I am authorised to approve audits of these public business websites on my team’s behalf. Each audit reads up to 3 public pages and respects robots.txt and access restrictions.</span></label>
      <Button disabled={saving || !authorized} onClick={() => void update(true)}>{saving ? <Loader2 size={14} className="spin"/> : <Zap size={14}/>} Turn on automatic audits</Button>
    </div>}
    {message && <p className="auto-audit-message" role="status">{message}</p>}
  </div>;
}
