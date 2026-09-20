import { getServiceClient, jsonResponse, errorResponse } from './_shared/supabase.js';
import { buildTuningReport, renderTuningReportMarkdown, weekWindow } from '../../src/estimator/tuningReport';
import type { TuningEvent } from '../../src/estimator/tuningReport';

export const config = {
  schedule: '0 14 * * 1',
};

export default async function handler() {
  try {
    const { since, until } = weekWindow();
    const supabase = getServiceClient();
    const { data: decisions, error } = await supabase
      .from('owner_decisions')
      .select('estimation_run_id, business_id, rivet_recommendation, owner_action, reason_code, rivet_price, owner_price, decided_at')
      .gte('decided_at', since.toISOString());
    if (error) return errorResponse(error.message, 500);

    const runIds = [...new Set((decisions ?? []).map(d => d.estimation_run_id as string))];
    const familyByRun = new Map<string, string>();
    if (runIds.length) {
      const { data: runs } = await supabase.from('estimation_runs').select('id, project_family').in('id', runIds);
      for (const r of runs ?? []) familyByRun.set(r.id as string, r.project_family as string);
    }

    const events: TuningEvent[] = (decisions ?? []).map(d => ({
      decidedAt: d.decided_at as string,
      businessId: d.business_id as string,
      projectFamily: familyByRun.get(d.estimation_run_id as string) ?? 'unknown',
      rec: d.rivet_recommendation as TuningEvent['rec'],
      action: d.owner_action as TuningEvent['action'],
      reasonCode: (d.reason_code as TuningEvent['reasonCode']) ?? undefined,
      rivetPrice: Number(d.rivet_price),
      ownerPrice: d.owner_price == null ? null : Number(d.owner_price),
    }));

    const report = buildTuningReport(events, since, until);
    const markdown = renderTuningReportMarkdown(report);

    const to = process.env.TUNING_REPORT_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;
    if (to && resendKey) {
      const from = process.env.RESEND_FROM_EMAIL || 'noreply@myrivet.io';
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `Rivet tuning report · ${report.misses} misses / ${report.decisions} decisions`,
          text: markdown,
        }),
      });
      if (!sent.ok) {
        const body = await sent.text();
        console.error('Resend failed', body);
        return errorResponse('Failed to email tuning report', 502);
      }
    } else {
      console.log(markdown);
    }

    return jsonResponse({
      decisions: report.decisions,
      misses: report.misses,
      emailed: Boolean(to && resendKey),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tuning report failed';
    return errorResponse(message, 500);
  }
}
