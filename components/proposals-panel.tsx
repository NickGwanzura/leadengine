'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, FileText, Loader2, Plus, Save } from 'lucide-react';
import { Button } from './ui/button';
import type { ProposalInput } from '@/lib/proposals';

type Company = { id: string; name: string };
type Package = { id: string; name: string; price: number; fromPrice: boolean };
type Proposal = ProposalInput & { id: string; status: string; total: number; updatedAt: string; company: Company; items: Array<ProposalInput['items'][number] & { id: string }> };
const sections = [
  ['summary', 'Executive summary'], ['objectives', 'Business objectives'], ['confirmedChallenges', 'Confirmed challenges'],
  ['scope', 'Recommended solution and scope'], ['deliverables', 'Deliverables'], ['phases', 'Implementation phases'],
  ['timeline', 'Estimated timeline'], ['paymentMilestones', 'Payment milestones'],
  ['hostingMaintenance', 'Hosting and maintenance'], ['exclusions', 'Exclusions'], ['terms', 'Terms and acceptance'],
] as const;
const blank = (companyId = ''): ProposalInput => ({ companyId, title: '', summary: '', objectives: '', confirmedChallenges: '', scope: '', deliverables: '', phases: '', timeline: '', paymentMilestones: '', hostingMaintenance: '', exclusions: '', terms: '', items: [{ description: '', quantity: 1, unitPrice: 0 }] });
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export function ProposalsPanel({ companies }: { companies: Company[] }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [draft, setDraft] = useState<ProposalInput>(() => blank(companies[0]?.id));
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/proposals');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load proposals');
      setProposals(data.proposals); setPackages(data.packages); setError('');
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  function edit(proposal: Proposal) {
    setEditingId(proposal.id); setNotice('');
    setDraft({ companyId: proposal.companyId, title: proposal.title, ...Object.fromEntries(sections.map(([key]) => [key, proposal[key]])), items: proposal.items.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: Number(item.unitPrice) })) } as ProposalInput);
  }
  function setField(key: typeof sections[number][0], value: string) { setDraft(previous => ({ ...previous, [key]: value })); }
  function setItem(index: number, change: Partial<ProposalInput['items'][number]>) {
    setDraft(previous => ({ ...previous, items: previous.items.map((item, position) => position === index ? { ...item, ...change } : item) }));
  }
  function addPackage(id: string) {
    const selected = packages.find(pkg => pkg.id === id);
    if (!selected) return;
    setDraft(previous => ({ ...previous, items: [...previous.items.filter(item => item.description.trim()), { description: selected.name, quantity: 1, unitPrice: selected.price }] }));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(editingId ? `/api/proposals/${editingId}` : '/api/proposals', { method: editingId ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save proposal');
      setEditingId(editingId || data.id); setNotice('Draft saved. Open the preview to print or save a PDF.');
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  const total = draft.items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
  return <div className="proposals-workspace">
    <section className="panel proposals-list"><div className="panel-heading"><div><h2>Proposal drafts</h2><p>Prices come from editable Spiritus packages and can be adjusted per scope.</p></div><Button variant="outline" onClick={() => { setEditingId(''); setDraft(blank(companies[0]?.id)); setNotice(''); }}><Plus size={14}/> New draft</Button></div>
      {loading ? <div className="empty"><Loader2 className="spin" size={22}/><p>Loading drafts…</p></div> : proposals.length ? proposals.map(proposal => <div className="proposal-list-row" key={proposal.id}><div><strong>{proposal.title}</strong><p>{proposal.company.name} · {money(proposal.total)} · {new Date(proposal.updatedAt).toLocaleDateString()}</p></div><span className="status">{proposal.status.toLowerCase()}</span><button className="text-button" onClick={() => edit(proposal)}>Edit</button><Link className="text-button" href={`/proposals/${proposal.id}`} target="_blank" rel="noopener noreferrer">Preview <ArrowUpRight size={13}/></Link></div>) : <div className="empty"><FileText size={27}/><h3>No proposals yet</h3><p>Create a draft from confirmed discovery details and configured packages.</p></div>}
    </section>
    <section className="panel proposal-editor"><div className="panel-heading"><div><h2>{editingId ? 'Edit proposal draft' : 'Create proposal draft'}</h2><p>Blank sections remain clearly marked for discovery in the printed document.</p></div></div>
      {error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
      <form onSubmit={save}><div className="proposal-top-fields"><label>Company<select required value={draft.companyId} onChange={event => setDraft(previous => ({ ...previous, companyId: event.target.value }))}><option value="">Select a company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Proposal title<input required minLength={3} maxLength={200} value={draft.title} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} placeholder="Business platform proposal"/></label></div>
      <div className="proposal-fields">{sections.map(([key, label]) => <label key={key}>{label}<textarea maxLength={10000} value={draft[key]} onChange={event => setField(key, event.target.value)} placeholder={key === 'confirmedChallenges' ? 'Only include challenges confirmed with the client' : 'Add verified details or leave blank for discovery'}/></label>)}</div>
      <div className="proposal-items-heading"><h3>Pricing · USD</h3><select aria-label="Add Spiritus package" defaultValue="" onChange={event => { addPackage(event.target.value); event.target.value = ''; }}><option value="">Add a configured package…</option>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name} · {pkg.fromPrice ? 'from ' : ''}{money(pkg.price)}</option>)}</select></div>
      {draft.items.map((item, index) => <div className="proposal-item-row" key={index}><label>Item<input required maxLength={300} value={item.description} onChange={event => setItem(index, { description: event.target.value })} placeholder="Solution or service"/></label><label>Quantity<input required type="number" min={1} max={1000} value={item.quantity} onChange={event => setItem(index, { quantity: Number(event.target.value) })}/></label><label>Unit price<input required type="number" min={0} max={100000000} step="0.01" value={item.unitPrice} onChange={event => setItem(index, { unitPrice: Number(event.target.value) })}/></label><button type="button" className="text-button" disabled={draft.items.length === 1} onClick={() => setDraft(previous => ({ ...previous, items: previous.items.filter((_, position) => position !== index) }))}>Remove</button></div>)}
      <div className="proposal-editor-footer"><button type="button" className="text-button" onClick={() => setDraft(previous => ({ ...previous, items: [...previous.items, { description: '', quantity: 1, unitPrice: 0 }] }))}><Plus size={14}/> Add line item</button><strong>Draft total {money(total)}</strong><Button disabled={busy || !draft.companyId || !draft.title.trim()}>{busy ? <Loader2 className="spin" size={14}/> : <Save size={14}/>} Save draft</Button></div>
      </form>
    </section>
  </div>;
}
