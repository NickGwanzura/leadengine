import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { requireMember } from '@/lib/access';
import { PrintProposalButton } from '@/components/print-proposal-button';

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const member = await requireMember();
  const { id } = await params;
  const proposal = await db.proposal.findFirst({ where: { id, organizationId: member.organizationId }, include: { company: true, items: { orderBy: { sortOrder: 'asc' } } } });
  if (!proposal) notFound();
  const total = proposal.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  const blocks = [
    ['Executive summary', proposal.summary],
    ['Business objectives', proposal.objectives],
    ['Confirmed challenges', proposal.confirmedChallenges],
    ['Recommended solution and scope', proposal.scope],
    ['Deliverables', proposal.deliverables],
    ['Implementation phases', proposal.phases],
    ['Estimated timeline', proposal.timeline],
    ['Payment milestones', proposal.paymentMilestones],
    ['Hosting and maintenance', proposal.hostingMaintenance],
    ['Exclusions', proposal.exclusions],
    ['Terms and acceptance', proposal.terms],
  ];
  return <main className="proposal-print-shell"><div className="proposal-print-actions"><span>Private draft · Review before sharing</span><PrintProposalButton/></div><article className="proposal-document">
    <header><div className="proposal-brand">spiritus <span>/ Systems</span></div><span className="proposal-draft-label">DRAFT PROPOSAL</span></header>
    <div className="proposal-title-block"><p className="eyebrow">PREPARED FOR {proposal.company.name.toUpperCase()}</p><h1>{proposal.title}</h1><p>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(proposal.updatedAt)} · Spiritus Systems</p></div>
    {blocks.slice(0, 7).map(([heading, value]) => <section key={heading}><h2>{heading}</h2><p>{value || 'To be confirmed during discovery.'}</p></section>)}
    <section><h2>Pricing · USD</h2><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{proposal.items.map(item => <tr key={item.id}><td>{item.description}</td><td>{item.quantity}</td><td>{money(Number(item.unitPrice))}</td><td>{money(Number(item.unitPrice) * item.quantity)}</td></tr>)}</tbody><tfoot><tr><td colSpan={3}>Estimated total</td><td>{money(total)}</td></tr></tfoot></table><p className="proposal-price-note">All prices are draft estimates until scope and commercial terms are agreed.</p></section>
    {blocks.slice(7).map(([heading, value]) => <section key={heading}><h2>{heading}</h2><p>{value || 'To be confirmed during discovery.'}</p></section>)}
    <footer>Spiritus Systems · Working draft for discussion · No acceptance or commitment recorded</footer>
  </article></main>;
}
