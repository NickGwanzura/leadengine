import { db } from '@/lib/db';
import { outboundEmailConfiguration } from '@/lib/outbound-email';
import { briefDue, harareDateKey } from '@/lib/sales-insights';
import { buildToday, type TodayList } from '@/lib/today';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Subject and bodies for one person's brief, or null when there is nothing to do today. */
export function briefContent(today: TodayList, appUrl: string, name: string) {
  const items = [...today.due, ...today.newLeads, ...today.goneQuiet];
  if (!items.length) return null;
  const counts = [today.due.length && `${today.due.length} follow-up${today.due.length === 1 ? '' : 's'} due`, today.newLeads.length && `${today.newLeads.length} new lead${today.newLeads.length === 1 ? '' : 's'}`, today.goneQuiet.length && `${today.goneQuiet.length} gone quiet`].filter(Boolean).join(', ');
  const top = items.slice(0, 6).map(item => `${item.company.name}: ${item.reason}${item.score !== null ? ` (${item.score}/100)` : ''}`);
  const link = new URL('/#today', appUrl).toString();
  const greeting = `Good morning ${name.trim().split(/\s+/)[0] || 'there'},`;
  return {
    subject: `Today: ${counts}`,
    text: `${greeting}\n\n${counts}.\n\n${top.map(line => `• ${line}`).join('\n')}\n\nOpen Today: ${link}\n\nYou get this because you turned on the morning brief in LeadOS. Turn it off on the Today screen.`,
    html: `<p>${escapeHtml(greeting)}</p><p><strong>${escapeHtml(counts)}.</strong></p><ul>${top.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p><a href="${escapeHtml(link)}">Open Today in LeadOS</a></p><p style="color:#667085;font-size:12px">You get this because you turned on the morning brief in LeadOS. Turn it off on the Today screen.</p>`,
  };
}

export function briefConfigured() {
  return outboundEmailConfiguration().configured;
}

/** Sends each opted-in member their brief once per Harare day, from 07:30. */
export async function sendMorningBriefs(now = new Date()) {
  const config = outboundEmailConfiguration();
  if (!config.configured) return { sent: 0, configured: false };
  const dateKey = harareDateKey(now);
  const members = await db.organizationMember.findMany({ where: { morningBrief: true, role: { not: 'VIEWER' } }, select: { id: true, organizationId: true, briefSentOn: true, user: { select: { email: true, name: true } } } });
  const todayByOrganization = new Map<string, Promise<TodayList>>();
  let sent = 0;
  for (const member of members) {
    if (!briefDue(now, member.briefSentOn)) continue;
    // Claim the day first so overlapping scheduler ticks cannot send twice.
    const claimed = await db.organizationMember.updateMany({ where: { id: member.id, OR: [{ briefSentOn: null }, { briefSentOn: { not: dateKey } }] }, data: { briefSentOn: dateKey } });
    if (!claimed.count) continue;
    if (!todayByOrganization.has(member.organizationId)) todayByOrganization.set(member.organizationId, buildToday(member.organizationId));
    const content = briefContent(await todayByOrganization.get(member.organizationId)!, config.origin!.toString(), member.user.name);
    if (!content) continue;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json', 'idempotency-key': `brief/${member.id}/${dateKey}` },
        body: JSON.stringify({ from: config.from, to: [member.user.email], subject: content.subject, text: content.text, html: content.html, tags: [{ name: 'leados_type', value: 'morning_brief' }] }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sent++;
    } catch {
      // Release the claim so the next tick retries today.
      await db.organizationMember.update({ where: { id: member.id }, data: { briefSentOn: member.briefSentOn } });
    }
  }
  return { sent, configured: true };
}
