import type { OwnerAction, ReasonCode, Recommendation } from './types';
import { isRecDisagreement } from './decisionFeedback';

export type TuningEvent = {
  decidedAt: string;
  businessId: string;
  projectFamily: string;
  rec: Recommendation;
  action: OwnerAction;
  reasonCode?: ReasonCode;
  rivetPrice: number;
  ownerPrice: number | null;
};

export type TuningReport = {
  since: string;
  until: string;
  decisions: number;
  misses: number;
  missRate: number;
  passTaken: number;
  sendDeclined: number;
  lookFirstClosed: number;
  reasons: Record<string, number>;
  byFamily: Record<string, { decisions: number; misses: number }>;
  priceTooHigh: number;
  priceTooLow: number;
  suggestedTunes: string[];
  missRows: TuningEvent[];
};

export function weekWindow(now = new Date()): { since: Date; until: Date } {
  const until = now;
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { since, until };
}

export function inWindow(iso: string, since: Date, until: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= since.getTime() && t <= until.getTime();
}

function bump(map: Record<string, number>, key: string, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

export function buildTuningReport(
  events: TuningEvent[],
  since: Date,
  until: Date,
): TuningReport {
  const inRange = events.filter(e => inWindow(e.decidedAt, since, until) && e.action !== 'reviewed_later');
  const reasons: Record<string, number> = {};
  const byFamily: Record<string, { decisions: number; misses: number }> = {};
  let passTaken = 0;
  let sendDeclined = 0;
  let lookFirstClosed = 0;
  let priceTooHigh = 0;
  let priceTooLow = 0;
  const missRows: TuningEvent[] = [];

  for (const e of inRange) {
    const fam = byFamily[e.projectFamily] ?? { decisions: 0, misses: 0 };
    fam.decisions += 1;
    if (e.reasonCode === 'SYSTEM_TOO_HIGH') priceTooHigh += 1;
    if (e.reasonCode === 'SYSTEM_TOO_LOW') priceTooLow += 1;
    if (e.reasonCode) bump(reasons, e.reasonCode);

    const miss = isRecDisagreement(e.rec, e.action);
    if (miss) {
      fam.misses += 1;
      missRows.push(e);
      if (e.rec === 'pass') passTaken += 1;
      else if (e.rec === 'take' || e.rec === 'take_at_price') sendDeclined += 1;
      else if (e.rec === 'review') lookFirstClosed += 1;
    }
    byFamily[e.projectFamily] = fam;
  }

  const decisions = inRange.length;
  const misses = missRows.length;
  const suggestedTunes = suggestTunes({
    decisions,
    misses,
    passTaken,
    sendDeclined,
    lookFirstClosed,
    reasons,
    byFamily,
    priceTooHigh,
    priceTooLow,
  });

  return {
    since: since.toISOString(),
    until: until.toISOString(),
    decisions,
    misses,
    missRate: decisions === 0 ? 0 : misses / decisions,
    passTaken,
    sendDeclined,
    lookFirstClosed,
    reasons,
    byFamily,
    priceTooHigh,
    priceTooLow,
    suggestedTunes,
    missRows,
  };
}

export function suggestTunes(input: {
  decisions: number;
  misses: number;
  passTaken: number;
  sendDeclined: number;
  lookFirstClosed: number;
  reasons: Record<string, number>;
  byFamily: Record<string, { decisions: number; misses: number }>;
  priceTooHigh: number;
  priceTooLow: number;
}): string[] {
  const out: string[] = [];
  if (input.decisions === 0) {
    return ['No owner decisions in this window. Nothing to tune yet.'];
  }

  if (input.passTaken >= 2) {
    out.push(`They took ${input.passTaken} jobs we Passed. Check remaining-hours math and whether Pass is firing on work that still fits.`);
  }
  if ((input.reasons.REC_SHOULD_HAVE_PASSED ?? 0) >= 2) {
    out.push(`They declined ${input.reasons.REC_SHOULD_HAVE_PASSED} Sends as "should have been a Pass." Walk-away or week-ask may be too cheap, or we are sending junk work.`);
  }
  if ((input.reasons.REC_DONT_WANT_CUSTOMER ?? 0) >= 1 && (input.reasons.REC_SHOULD_HAVE_PASSED ?? 0) === 0) {
    out.push('Declines are customer-fit, not price. Do not chase those with assembly tweaks.');
  }
  if ((input.reasons.REC_SHOULD_HAVE_SENT ?? 0) >= 2) {
    out.push(`Look first was too conservative ${input.reasons.REC_SHOULD_HAVE_SENT} times. Tighten named-check rules or confidence floor on those families.`);
  }
  if ((input.reasons.REC_LOOK_FIRST_CLEAR ?? 0) >= 2) {
    out.push('Look first checks are coming back clean. Keep the check, but the hours after the look may be the thing to tune.');
  }
  if (input.priceTooHigh >= 3) {
    out.push(`Price moved down ${input.priceTooHigh} times (system too high). Review assemblies that show up most in by-family misses.`);
  }
  if (input.priceTooLow >= 3) {
    out.push(`Price moved up ${input.priceTooLow} times (system too low). Those families are leaving money on the table.`);
  }

  const hotFamilies = Object.entries(input.byFamily)
    .filter(([, v]) => v.misses >= 2)
    .sort((a, b) => b[1].misses - a[1].misses)
    .slice(0, 3)
    .map(([name, v]) => `${name} (${v.misses}/${v.decisions})`);
  if (hotFamilies.length) {
    out.push(`Families with repeated misses: ${hotFamilies.join(', ')}.`);
  }

  if (out.length === 0) {
    out.push('Misses are sparse. No assembly or rule change this week — watch another week.');
  }
  return out;
}

export function renderTuningReportMarkdown(report: TuningReport, narrative?: string): string {
  const pct = report.decisions === 0 ? '—' : `${Math.round(report.missRate * 100)}%`;
  const reasonLines = Object.entries(report.reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `| ${code} | ${n} |`)
    .join('\n');
  const familyLines = Object.entries(report.byFamily)
    .sort((a, b) => b[1].misses - a[1].misses)
    .map(([name, v]) => `| ${name} | ${v.decisions} | ${v.misses} |`)
    .join('\n');
  const missLines = report.missRows
    .map(r => `| ${r.decidedAt.slice(0, 10)} | ${r.projectFamily} | ${r.rec} | ${r.action} | ${r.reasonCode ?? '—'} | ${r.rivetPrice} | ${r.ownerPrice ?? '—'} |`)
    .join('\n');

  return `# Weekly tuning report

${report.since.slice(0, 10)} → ${report.until.slice(0, 10)}

| Decisions | Misses | Miss rate | Pass they took | Send they declined | Look first closed |
| ---: | ---: | ---: | ---: | ---: | ---: |
| ${report.decisions} | ${report.misses} | ${pct} | ${report.passTaken} | ${report.sendDeclined} | ${report.lookFirstClosed} |

Price direction: ${report.priceTooHigh} too high · ${report.priceTooLow} too low

## What to change

${report.suggestedTunes.map(s => `- ${s}`).join('\n')}
${narrative ? `\n## Notes\n\n${narrative}\n` : ''}
## Reasons

| Code | Count |
| --- | ---: |
${reasonLines || '| — | 0 |'}

## By family

| Family | Decisions | Misses |
| --- | ---: | ---: |
${familyLines || '| — | 0 | 0 |'}

## Miss rows

| Date | Family | Rec | Action | Reason | Rivet $ | Owner $ |
| --- | --- | --- | --- | --- | ---: | ---: |
${missLines || '| — | — | — | — | — | — | — |'}
`;
}
