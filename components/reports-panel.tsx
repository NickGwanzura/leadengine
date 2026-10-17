'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChartNoAxesCombined, Loader2 } from 'lucide-react';
import { stages as pipelineStages } from '@/lib/validation';

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

  if (loading && !report) return <section className="panel report-loading"><Loader2 className="spin" size={18}/> Loading reports…</section>;
  if (error) return <div className="error" role="alert">{error}</div>;
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
    <section className="panel"><div className="panel-heading"><div><h2>Sales and research metrics</h2><p>New prospects and recent audits use the selected {report.days}-day window; other values show the current organization snapshot.</p></div>{loading && <Loader2 className="spin" size={16}/>}</div><div className="report-metrics">{metrics.map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <div className="report-breakdowns"><section className="panel"><div className="panel-heading"><div><h2>Pipeline stages</h2><p>Current stage counts and recorded deal values.</p></div></div><div className="report-bars">{pipelineStages.map(stage => { const row = stageCounts.get(stage); const count = row?.count || 0; return <div className="report-bar-row" key={stage}><span>{stage.toLowerCase()}</span><div className="report-bar-track"><i style={{ width: `${count / maxStageCount * 100}%` }}/></div><strong>{count}</strong><small>{money(row?.value || 0)}</small></div>; })}</div></section>
      <div className="report-side"><section className="panel"><div className="panel-heading"><h2>Lead sources</h2></div><div className="report-count-list">{report.sources.length ? report.sources.map(row => <div key={row.label}><span>{row.label}</span><strong>{row.count}</strong></div>) : <p>No sources recorded yet.</p>}</div></section><section className="panel"><div className="panel-heading"><h2>Industries</h2></div><div className="report-count-list">{report.industries.length ? report.industries.map(row => <div key={row.label}><span>{row.label}</span><strong>{row.count}</strong></div>) : <p>No industries recorded yet.</p>}</div></section></div>
    </div><p className="report-footnote"><ChartNoAxesCombined size={14}/> Stage counts are a current snapshot, not a historical conversion funnel. Won revenue is the recorded deal value of companies in WON.</p>
  </div>;
}
