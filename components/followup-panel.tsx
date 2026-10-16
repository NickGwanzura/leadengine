'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, CheckSquare, Clock, Loader2, Plus, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';

type CompanyOption = { id: string; name: string; nextFollowUp?: string };
type FollowUpTask = { id: string; title: string; description: string; type: string; dueAt: string; status: string; company: CompanyOption | null; assignee: { name: string; email: string } | null };
const options = ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'PROPOSAL', 'GENERAL'];
async function api(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const localDateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const isOverdue = (value: string) => new Date(value).getTime() < Date.now();

export function FollowupPanel({ companies, onOpenCompany }: { companies: CompanyOption[]; onOpenCompany: (companyId: string) => void }) {
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('GENERAL');
  const [companyId, setCompanyId] = useState('');
  const [dueAt, setDueAt] = useState(() => { const date = new Date(Date.now() + 86400000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const load = useCallback(async () => {
    try { const result = await api(`/api/followups${showCompleted ? '?completed=true' : ''}`); setTasks(result.tasks); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [showCompleted]);
  useEffect(() => {
    let active = true;
    api(`/api/followups${showCompleted ? '?completed=true' : ''}`).then(result => { if (active) { setTasks(result.tasks); setError(''); } })
      .catch(e => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showCompleted]);
  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/api/followups', 'POST', { title, description, type, dueAt: new Date(dueAt).toISOString(), companyId: companyId || null });
      setTitle(''); setDescription(''); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function updateTask(task: FollowUpTask, values: { status?: string; dueAt?: string }) {
    setBusy(true); setError('');
    try { await api(`/api/followups/${task.id}`, 'PATCH', values); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const openTasks = tasks.filter(task => task.status === 'OPEN');
  const taskCompanies = new Set(openTasks.flatMap(task => task.company ? [task.company.id] : []));
  const legacy = companies.filter(company => company.nextFollowUp && !taskCompanies.has(company.id));
  const overdueCount = openTasks.filter(task => isOverdue(task.dueAt)).length + legacy.filter(company => isOverdue(company.nextFollowUp!)).length;
  return <div className="followup-workspace">
    <section className="panel followup-create">
      <div className="panel-heading"><div><h2>Schedule a follow-up</h2><p>Keep calls, messages, meetings and proposal check-ins attached to the right company.</p></div></div>
      {error && <div className="error" role="alert">{error}</div>}
      <form onSubmit={createTask}>
        <div className="followup-form-grid">
          <label>Task title<input required minLength={3} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="Call to confirm discovery meeting"/></label>
          <label>Task type<select value={type} onChange={event => setType(event.target.value)}>{options.map(value => <option key={value} value={value}>{value.replace('_', ' ').toLowerCase()}</option>)}</select></label>
          <label>Company<select value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="">General task</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label>Due date and time<input required type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)}/></label>
        </div>
        <label className="followup-description">Notes<textarea maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Context and desired next step"/></label>
        <Button disabled={busy}><Plus size={15}/> Add follow-up</Button>
      </form>
    </section>
    <section className="panel followup-list">
      <div className="panel-heading"><div><h2>Follow-up queue</h2><p>{overdueCount ? `${overdueCount} overdue · ` : ''}{openTasks.length} open tasks</p></div><Button variant="outline" onClick={() => setShowCompleted(value => !value)}>{showCompleted ? 'Hide completed' : 'Show completed'}</Button></div>
      {loading ? <div className="empty"><Loader2 className="spin" size={22}/><p>Loading follow-ups…</p></div> : tasks.length || (!showCompleted && legacy.length) ? <>
      {tasks.map(task => <article className={`followup-row ${task.status === 'OPEN' && isOverdue(task.dueAt) ? 'overdue' : ''}`} key={task.id}>
        <div className="followup-icon">{task.status === 'COMPLETED' ? <Check size={17}/> : <Clock size={17}/>}</div>
        <div className="followup-main"><strong>{task.title}</strong><p>{task.description || task.company?.name || 'General workspace task'}</p><small>{task.type.replace('_', ' ')}{task.company ? ` · ${task.company.name}` : ''}{task.assignee ? ` · ${task.assignee.name}` : ''}</small></div>
        <time>{localDateTime(task.dueAt)}</time>
        <span className={`status ${task.status === 'COMPLETED' ? 'positive' : task.status === 'OPEN' && isOverdue(task.dueAt) ? 'danger' : ''}`}>{task.status === 'OPEN' && isOverdue(task.dueAt) ? 'Overdue' : task.status.toLowerCase()}</span>
        {task.status === 'OPEN' && <div className="followup-actions"><button disabled={busy} title="Mark complete" aria-label={`Complete ${task.title}`} onClick={() => void updateTask(task, { status: 'COMPLETED' })}><CheckSquare size={16}/></button><button disabled={busy} title="Move to tomorrow" aria-label={`Move ${task.title} to tomorrow`} onClick={() => void updateTask(task, { dueAt: new Date(new Date(task.dueAt).getTime() + 86400000).toISOString() })}><RotateCcw size={16}/></button></div>}
      </article>)}
      {!showCompleted && legacy.map(company => <article className={`followup-row ${isOverdue(company.nextFollowUp!) ? 'overdue' : ''}`} key={`legacy-${company.id}`}>
        <div className="followup-icon"><Clock size={17}/></div><div className="followup-main"><strong>Scheduled company reminder</strong><p>{company.name}</p><small>Legacy reminder · Open the company record to edit details</small></div>
        <time>{localDateTime(company.nextFollowUp!)}</time><span className={`status ${isOverdue(company.nextFollowUp!) ? 'danger' : ''}`}>{isOverdue(company.nextFollowUp!) ? 'Overdue' : 'Upcoming'}</span>
        <button className="text-button" onClick={() => onOpenCompany(company.id)}>Open company</button>
      </article>)}
      </> : <div className="empty"><CheckSquare size={28}/><h3>{showCompleted ? 'No follow-ups yet' : 'Your open follow-ups are clear'}</h3><p>Schedule a task above to create a reminder.</p></div>}
    </section>
  </div>;
}
