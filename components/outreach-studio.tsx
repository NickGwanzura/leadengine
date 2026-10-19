'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Check, Clipboard, Send, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

type CompanyOption = { id: string; name: string; email?: string | null };
type SendRecord = { id: string; recipientEmail: string; status: string; createdAt: string; sentAt: string | null; error: string | null };
type Draft = { id: string; companyId: string; company: CompanyOption; channel: string; purpose: string; subject: string | null; body: string; facts: Record<string, unknown>; assumptions: string[]; provider: string; model: string; updatedAt: string; sends: SendRecord[] };
type ProviderStatus = { configured: boolean; provider: string; model: string; destination: string | null };
type OutboundStatus = { configured: boolean; sender: string | null; webhookConfigured: boolean; postalAddressConfigured: boolean };
const channels = [
  ['COLD_EMAIL', 'Cold email'], ['FOLLOWUP_EMAIL', 'Follow-up email'], ['WHATSAPP', 'WhatsApp introduction'],
  ['LINKEDIN', 'LinkedIn message'], ['MEETING_REQUEST', 'Discovery meeting request'], ['MEETING_AGENDA', 'Meeting agenda'],
  ['PROPOSAL_OUTLINE', 'Proposal outline'], ['AUDIT_SUMMARY', 'Website audit summary'], ['PRODUCT_PITCH', 'Product pitch'],
];
async function api(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export function OutreachStudio({ companies }: { companies: CompanyOption[] }) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [outboundStatus, setOutboundStatus] = useState<OutboundStatus | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [channel, setChannel] = useState('FOLLOWUP_EMAIL');
  const [purpose, setPurpose] = useState('Start a useful conversation based on verified company context.');
  const [confirmed, setConfirmed] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sendConfirmed, setSendConfirmed] = useState(false);
  const [requestKey, setRequestKey] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api('/api/ai/status'), api('/api/ai/drafts'), api('/api/outreach/status')]).then(([providerResult, draftResult, outboundResult]) => {
      if (active) { setStatus(providerResult); setDrafts(draftResult.drafts); setOutboundStatus(outboundResult); setError(''); }
    }).catch(e => { if (active) setError((e as Error).message); });
    const refreshSends = () => { void api('/api/ai/drafts').then(result => { if (active) setDrafts(result.drafts); }).catch(() => {}); };
    const timer = window.setInterval(refreshSends, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/api/ai/drafts', 'POST', { companyId: companyId || companies[0]?.id || '', channel, purpose, confirmExternalProcessing: confirmed });
      setDrafts(previous => [result.draft, ...previous.filter(draft => draft.id !== result.draft.id)]);
      setSelectedId(result.draft.id); setSubject(result.draft.subject || ''); setBody(result.draft.body); setRecipientEmail(result.draft.company.email || ''); setConfirmed(false); setNotice('Draft saved for review. It has not been sent.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    if (!selectedId) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/api/ai/drafts/${selectedId}`, 'PATCH', { subject: subject || null, body });
      setDrafts(previous => previous.map(draft => draft.id === selectedId ? { ...draft, ...result.draft } : draft));
      setNotice('Draft changes saved.');
      return true;
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
    return false;
  }
  async function sendSelectedDraft() {
    if (!selected || !recipientEmail.trim() || !sendConfirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await api(`/api/ai/drafts/${selected.id}`, 'PATCH', { subject: subject || null, body });
      setDrafts(previous => previous.map(draft => draft.id === selected.id ? { ...draft, ...saved.draft } : draft));
      const key = requestKey || crypto.randomUUID();
      setRequestKey(key);
      const result = await api('/api/outreach/sends', 'POST', { draftId: selected.id, recipientEmail: recipientEmail.trim(), requestKey: key, confirmSend: true });
      setDrafts(previous => previous.map(draft => draft.id === selected.id ? { ...draft, sends: [result.send, ...draft.sends.filter(item => item.id !== result.send.id)] } : draft));
      setShowSendConfirm(false); setSendConfirmed(false); setRequestKey(''); setNotice(result.alreadySent ? 'This send request was already accepted; no duplicate was sent.' : 'Email accepted by Resend. Delivery updates will appear in the send history.');
    } catch (e) { const message = (e as Error).message; if (message.startsWith('Resend rejected the email')) setRequestKey(''); setError(message); }
    finally { setBusy(false); }
  }
  async function copyDraft() {
    try { await navigator.clipboard.writeText(`${subject ? `${subject}\n\n` : ''}${body}`); setNotice('Draft copied to clipboard.'); }
    catch { setError('Clipboard access is unavailable in this browser.'); }
  }
  const selected = drafts.find(draft => draft.id === selectedId);
  const facts = selected?.facts || {};
  return <div className="outreach-layout">
    <section className="panel outreach-compose">
      <div className="panel-heading"><div><h2><Sparkles size={16}/> Create a reviewed draft</h2><p>Only use facts from the selected LeadOS record. Drafts require human review.</p></div></div>
      <form onSubmit={generate}>
        <label>Company<select required value={companyId || companies[0]?.id || ''} onChange={event => setCompanyId(event.target.value)}><option value="">Choose a company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label>Draft type<select value={channel} onChange={event => setChannel(event.target.value)}>{channels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Purpose and context<textarea required minLength={5} maxLength={500} value={purpose} onChange={event => setPurpose(event.target.value)}/></label>
        <label className="ai-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>I authorize sending this company’s name, industry, location, contact name/role, pipeline stage, assigned product, entered deal value, notes, recent activity notes, and latest website audit summary/findings to {status?.provider || 'the configured AI provider'} at {status?.destination || 'its configured endpoint'} to create this draft. The API key stays server-side; no message will be sent.</span></label>
        {error && <div className="error" role="alert"><AlertCircle size={16}/>{error}</div>}
        {notice && <div className="notice" role="status"><Check size={16}/>{notice}</div>}
        <Button disabled={busy || !companies.length || !status?.configured || !confirmed}><Sparkles size={15}/>{busy ? 'Generating…' : 'Generate draft'}</Button>
        {!status?.configured && <p className="provider-state">AI drafting is unavailable until a supported provider and server-side API key are configured.</p>}
      </form>
    </section>
    <section className="panel outreach-review">
      <div className="panel-heading"><div><h2>Draft review</h2><p>{drafts.length} saved drafts · Each email is sent individually after confirmation.</p></div><select aria-label="Choose a saved draft" value={selectedId} onChange={event => { const id = event.target.value; const draft = drafts.find(item => item.id === id); setSelectedId(id); setSubject(draft?.subject || ''); setBody(draft?.body || ''); setRecipientEmail(draft?.company.email || ''); setRequestKey(''); }}><option value="">Choose saved draft</option>{drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.company.name} · {draft.channel.replaceAll('_', ' ').toLowerCase()}</option>)}</select></div>
      {selected ? <div className="draft-editor">
        <div className="draft-meta"><span>{selected.company.name} · {selected.channel.replaceAll('_', ' ')}</span><small>{selected.provider} / {selected.model}</small></div>
        {selected.subject !== null && <label>Subject<input maxLength={200} value={subject} onChange={event => { setSubject(event.target.value); setRequestKey(''); }}/></label>}
        {['COLD_EMAIL', 'FOLLOWUP_EMAIL'].includes(selected.channel) && <label>Recipient email<input type="email" maxLength={254} required value={recipientEmail} onChange={event => { setRecipientEmail(event.target.value); setRequestKey(''); }} placeholder="name@company.com"/><small className="provider-state">Confirm that this is the right business contact. Suppressed addresses cannot be sent to.</small></label>}
        <label>Editable draft<textarea maxLength={10000} value={body} onChange={event => { setBody(event.target.value); setRequestKey(''); }}/></label>
        <details><summary>Confirmed CRM and audit facts supplied</summary><pre>{JSON.stringify(facts, null, 2)}</pre></details>
        <div className="draft-assumptions"><strong>Assumptions to verify</strong>{selected.assumptions.length ? <ul>{selected.assumptions.map((assumption, index) => <li key={`${assumption}-${index}`}>{assumption}</li>)}</ul> : <p>The draft listed no assumptions.</p>}</div>
        <div className="draft-actions"><Button variant="outline" disabled={busy || !body.trim()} onClick={() => void saveDraft()}><Check size={15}/> Save edits</Button><Button variant="outline" onClick={() => void copyDraft()}><Clipboard size={15}/> Copy draft</Button>{['COLD_EMAIL', 'FOLLOWUP_EMAIL'].includes(selected.channel) && <Button disabled={busy || !outboundStatus?.configured || !recipientEmail.trim() || !subject.trim() || !body.trim()} onClick={() => { setSendConfirmed(false); setShowSendConfirm(true); }}><Send size={15}/> Review email before sending</Button>}<span>{outboundStatus?.configured ? `From ${outboundStatus.sender}` : 'Sending is unavailable until an admin configures Resend, delivery webhooks and the postal address.'}</span></div>
        {selected.sends?.length > 0 && <div className="send-history"><h3>Send history</h3>{selected.sends.map(send => <article key={send.id}><div><strong>{send.recipientEmail}</strong><small>{new Date(send.createdAt).toLocaleString()}</small></div><span className={`status ${send.status === 'DELIVERED' ? 'positive' : ''}`}>{send.status.toLowerCase().replaceAll('_', ' ')}</span>{send.error && <p className="field-error">{send.error}</p>}</article>)}</div>}
      </div> : <div className="empty"><Send size={28}/><h3>Drafts stay in your hands</h3><p>Generate a message after an admin configures the provider. Every draft includes source facts and assumptions to check.</p></div>}
    </section>
    {showSendConfirm && selected && <div className="overlay" onClick={() => setShowSendConfirm(false)}><section className="modal send-confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm outbound email" onClick={event => event.stopPropagation()}><header><div><span className="eyebrow">FINAL REVIEW</span><h2>Send this email?</h2></div></header><div className="send-confirm-summary"><p><strong>To</strong><span>{recipientEmail}</span></p><p><strong>From</strong><span>{outboundStatus?.sender}</span></p><p><strong>Subject</strong><span>{subject}</span></p><div><strong>Message</strong><p>{body}</p></div><p className="muted">The message will include your configured business address and an unsubscribe link. Bounces, complaints, and delivery events update the send history.</p></div><label className="send-confirm-check"><input type="checkbox" checked={sendConfirmed} onChange={event => setSendConfirmed(event.target.checked)}/><span>I checked the recipient, subject, and message and authorize this one-time send.</span></label><footer><Button variant="outline" disabled={busy} onClick={() => setShowSendConfirm(false)}>Back to draft</Button><Button disabled={busy || !sendConfirmed} onClick={() => void sendSelectedDraft()}>{busy ? 'Sending…' : 'Send email'}</Button></footer></section></div>}
  </div>;
}
