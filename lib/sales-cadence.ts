import { stages } from '@/lib/validation';

export const outcomes = ['NO_ANSWER', 'INTERESTED', 'MEETING_BOOKED', 'NOT_NOW', 'WRONG_PERSON', 'NOT_INTERESTED'] as const;
export const channels = ['WHATSAPP', 'CALL', 'EMAIL', 'VISIT'] as const;
export type Outcome = typeof outcomes[number];
export type Channel = typeof channels[number];

export const outcomeLabels: Record<Outcome, string> = {
  NO_ANSWER: 'No answer', INTERESTED: 'Interested', MEETING_BOOKED: 'Meeting booked',
  NOT_NOW: 'Not now', WRONG_PERSON: 'Wrong person', NOT_INTERESTED: 'Not interested',
};
const channelLabels: Record<Channel, string> = { WHATSAPP: 'WhatsApp', CALL: 'Call', EMAIL: 'Email', VISIT: 'Visit' };
const taskType: Record<Channel, string> = { WHATSAPP: 'WHATSAPP', CALL: 'CALL', EMAIL: 'EMAIL', VISIT: 'MEETING' };

// Days to wait after each unanswered touch: touches land on roughly day 0, 3, 7, 14 and 30.
export const noAnswerGaps = [3, 4, 7, 16];
const nurtureDays = 90;

export type OutcomePlan = {
  stage: string;
  activity: string;
  closeOpenTasks: boolean;
  followUp: { title: string; type: string; days: number } | null;
  summary: string;
};

// Stages only move forward from an outcome, except an explicit "not interested", which closes the deal.
function forward(current: string, target: typeof stages[number]) {
  if (current === 'WON' || current === 'LOST') return current;
  const from = stages.indexOf(current as typeof stages[number]);
  return stages.indexOf(target) > from ? target : current;
}

/** previousTouches counts logged touches before this one. */
export function outcomePlan(outcome: Outcome, channel: Channel, previousTouches: number, currentStage: string): OutcomePlan {
  const touch = previousTouches + 1;
  const activity = `${channelLabels[channel]} · ${outcomeLabels[outcome]} (touch ${touch})`;
  const base = { activity, closeOpenTasks: true };
  switch (outcome) {
    case 'NO_ANSWER': {
      const gap = noAnswerGaps[previousTouches];
      if (gap === undefined) return { ...base, stage: forward(currentStage, 'CONTACTED'), followUp: { title: 'Check back after the follow-up sequence', type: 'GENERAL', days: nurtureDays }, summary: `Sequence finished after ${touch} touches; check back in ${nurtureDays} days.` };
      return { ...base, stage: forward(currentStage, 'CONTACTED'), followUp: { title: `Follow up (touch ${touch + 1})`, type: taskType[channel], days: gap }, summary: `Next follow-up in ${gap} days.` };
    }
    case 'INTERESTED':
      return { ...base, stage: forward(currentStage, 'CONTACTED'), followUp: { title: 'Book a discovery meeting', type: 'CALL', days: 1 }, summary: 'Book the discovery meeting tomorrow.' };
    case 'MEETING_BOOKED':
      return { ...base, stage: forward(currentStage, 'MEETING BOOKED'), followUp: { title: 'Prepare for the discovery meeting', type: 'MEETING', days: 1 }, summary: 'Moved to Meeting booked; prep task added.' };
    case 'NOT_NOW':
      return { ...base, stage: forward(currentStage, 'CONTACTED'), followUp: { title: 'Check back in', type: taskType[channel], days: nurtureDays }, summary: `Check back in ${nurtureDays} days.` };
    case 'WRONG_PERSON':
      return { ...base, stage: forward(currentStage, 'CONTACTED'), followUp: { title: 'Find the decision-maker', type: 'CALL', days: 2 }, summary: 'Find the decision-maker within 2 days.' };
    case 'NOT_INTERESTED':
      return { ...base, stage: currentStage === 'WON' ? 'WON' : 'LOST', followUp: null, summary: 'Marked lost; open follow-ups closed.' };
  }
}

/** International digits for wa.me, assuming Zimbabwe (+263) for local numbers. Null if it cannot be a phone number. */
export function whatsappNumber(raw?: string | null) {
  let digits = (raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `263${digits.slice(1)}`;
  else if (/^7\d{8}$/.test(digits)) digits = `263${digits}`;
  digits = digits.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

const sectorWord = (industry?: string | null) => {
  const value = (industry || '').trim().toLowerCase();
  return value && value !== 'unclassified' ? `${value} businesses` : 'businesses';
};

/** Opener for WhatsApp/email: the observed website gap, then the service that fits this lead's target group. */
export function openingMessage({ company, sender, domain, hook, service, industry }: { company: string; sender: string; domain?: string | null; hook?: string | null; service?: string | null; industry?: string | null }) {
  const first = sender.trim().split(/\s+/)[0] || 'there';
  const observation = hook ? ` I was looking at ${domain || 'your website'} and noticed: ${hook.replace(/\.?\s*$/, '.')}` : '';
  const offer = service
    ? hook ? ` Our ${service} helps ${sectorWord(industry)} fix exactly this.` : ` We work with ${sectorWord(industry)} in Zimbabwe, and our ${service} could be a good fit for ${company}.`
    : ' We help Zimbabwean businesses fix exactly this kind of thing with simple websites and systems.';
  return `Hi ${company} team, this is ${first} from Spiritus Systems.${observation}${offer} Would a 15-minute call this week be useful?`;
}
