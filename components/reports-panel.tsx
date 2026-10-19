'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChartNoAxesCombined, Loader2 } from 'lucide-react';
import { stages as pipelineStages } from '@/lib/validation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

type CountRow = { label: string; count: number };
type StageRow = { stage: string; count: number; value: number };
type Report = {
  days: number;
  totals: { totalProspects: number; newProspects: number; highPriority: number; auditCount: number; recentAudits: number; dueTasks: number; draftProposals: number; openDeals: number; pipelineValue: number; wonDeals: number; revenueWon: number };
  stages: StageRow[];
  sources: CountRow[];
  industries: CountRow[];
};
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export function ReportsPanel({ days }: { days: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports?days=${days}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load reports');
      setReport(data); setError('');
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  if (loading && !report) return <Card><CardContent className="flex items-center gap-2"><Loader2 className="spin" size={18}/> Loading reports…</CardContent></Card>;
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  if (!report) return null;
  const metrics = [
    ['New prospects', report.totals.newProspects],
    ['High-priority leads', report.totals.highPriority],
    ['Audits in period', report.totals.recentAudits],
    ['All audits completed', report.totals.auditCount],
    ['Proposal drafts', report.totals.draftProposals],
    ['Follow-ups due', report.totals.dueTasks],
    ['Open pipeline value', money(report.totals.pipelineValue)],
    ['Won revenue recorded', money(report.totals.revenueWon)],
  ] as const;
  const stageCounts = new Map(report.stages.map(row => [row.stage, row]));
  const maxStageCount = Math.max(1, ...report.stages.map(row => row.count));
  return <div className="reports-detail">
    <Card><CardHeader className="flex-row items-start justify-between"><div className="grid gap-2"><CardTitle>Sales and research metrics</CardTitle><CardDescription>New prospects and recent audits use the selected {report.days}-day window; other values show the current organization snapshot.</CardDescription></div>{loading && <Loader2 className="spin" size={16}/>}</CardHeader><CardContent className="grid grid-cols-2 gap-3 pt-0 lg:grid-cols-4">{metrics.map(([label,value]) => <div className="rounded-lg border border-[var(--line)] p-4" key={label}><span className="text-xs text-[var(--muted)]">{label}</span><strong className="mt-2 block text-xl">{value}</strong></div>)}</CardContent></Card>
    <div className="report-breakdowns"><Card><CardHeader><CardTitle>Pipeline stages</CardTitle><CardDescription>Current stage counts and recorded deal values.</CardDescription></CardHeader><CardContent className="grid gap-3 pt-0">{pipelineStages.map(stage => { const row = stageCounts.get(stage); const count = row?.count || 0; return <div className="report-bar-row" key={stage}><span>{stage.toLowerCase()}</span><div className="report-bar-track"><i style={{ width: `${count / maxStageCount * 100}%` }}/></div><strong>{count}</strong><small>{money(row?.value || 0)}</small></div>; })}</CardContent></Card>
      <div className="report-side"><Card><CardHeader><CardTitle>Lead sources</CardTitle></CardHeader><CardContent className="grid gap-2 pt-0">{report.sources.length ? report.sources.map(row => <div className="flex justify-between border-t border-[var(--line)] py-2 text-sm" key={row.label}><span>{row.label}</span><strong>{row.count}</strong></div>) : <p className="text-sm text-[var(--muted)]">No sources recorded yet.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Industries</CardTitle></CardHeader><CardContent className="grid gap-2 pt-0">{report.industries.length ? report.industries.map(row => <div className="flex justify-between border-t border-[var(--line)] py-2 text-sm" key={row.label}><span>{row.label}</span><strong>{row.count}</strong></div>) : <p className="text-sm text-[var(--muted)]">No industries recorded yet.</p>}</CardContent></Card></div>
    </div><p className="report-footnote"><ChartNoAxesCombined size={14}/> Stage counts are a current snapshot, not a historical conversion funnel. Won revenue is the recorded deal value of companies in WON.</p>
  </div>;
}
