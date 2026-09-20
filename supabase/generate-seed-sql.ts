/**
 * Generates SQL for Mason Home Services demo data from the live estimator.
 *
 *   npx tsx supabase/generate-seed-sql.ts
 *
 * Writes:
 *   supabase/seed-data.sql                 — inserts only (empty DB after migrations)
 *   supabase/refresh-mason-production.sql  — Mason-only wipe + inserts (production refresh)
 */

import { demoEstimationRuns, demoAdjustments, demoOutcomes, demoOwnerDecisions, demoWorkItems } from '../src/demo/seed';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASON_BIZ_ID = 'a0000000-0000-0000-0000-000000000001';

function esc(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function insertBlock(): string[] {
  const lines: string[] = [];

  lines.push('-- ─── Estimation Runs ───', '');
  for (const run of demoEstimationRuns) {
    lines.push(`INSERT INTO estimation_runs (id, business_id, work_id, created_at, project_family, estimator_version, ai_model, prompt_version, customer_inputs, extraction, baseline_estimate, calibration_applied, economic_job, decision_context, recommendation, reasons, confidence) VALUES (${esc(run.id)}, ${esc(run.businessId)}, ${run.workId ?? 'NULL'}, ${esc(run.createdAt)}, ${esc(run.projectFamily)}, ${esc(run.estimatorVersion)}, ${esc(run.aiModel)}, ${esc(run.promptVersion)}, ${esc(run.customerInputs)}, ${esc(run.extraction)}, ${esc(run.baselineEstimate)}, ${run.calibrationApplied ? esc(run.calibrationApplied) : 'NULL'}, ${esc(run.economicJob)}, ${esc(run.decisionContext)}, ${esc(run.recommendation)}, ${esc(run.reasons)}, ${run.confidence});`);
  }

  lines.push('', '-- ─── Adjustment Entries ───', '');
  for (const adj of demoAdjustments) {
    lines.push(`INSERT INTO adjustment_entries (id, estimation_run_id, business_id, user_id, field, system_value, previous_value, new_value, reason_code, reason_text, created_at) VALUES (${esc(adj.id)}, ${esc(adj.estimationRunId)}, ${esc(adj.businessId)}, ${esc(adj.userId)}, ${esc(adj.field)}, ${adj.systemValue}, ${adj.previousValue}, ${adj.newValue}, ${esc(adj.reasonCode)}, ${adj.reasonText ? esc(adj.reasonText) : 'NULL'}, ${esc(adj.createdAt)});`);
  }

  lines.push('', '-- ─── Actual Outcomes ───', '');
  for (const o of demoOutcomes) {
    lines.push(`INSERT INTO actual_outcomes (id, estimation_run_id, actual_labor_hours, actual_material_cost, actual_procurement_hours, final_revenue, return_trips, quoted_price, recorded_at, notes) VALUES (${esc(o.id)}, ${esc(o.estimationRunId)}, ${o.actualLaborHours}, ${o.actualMaterialCost}, ${o.actualProcurementHours}, ${o.finalRevenue}, ${o.returnTrips}, ${o.quotedPrice != null ? o.quotedPrice : 'NULL'}, ${esc(o.recordedAt)}, ${o.notes ? esc(o.notes) : 'NULL'});`);
  }

  lines.push('', '-- ─── Owner Decisions ───', '');
  for (const d of demoOwnerDecisions) {
    lines.push(`INSERT INTO owner_decisions (id, estimation_run_id, business_id, user_id, rivet_recommendation, owner_action, rivet_price, owner_price, quoted_price, reason_code, reason_text, decision_snapshot, decided_at) VALUES (${esc(d.id)}, ${esc(d.estimationRunId)}, ${esc(d.businessId)}, ${esc(d.userId)}, ${esc(d.rivetRecommendation)}, ${esc(d.ownerAction)}, ${d.rivetPrice}, ${d.ownerPrice != null ? d.ownerPrice : 'NULL'}, ${d.quotedPrice != null ? d.quotedPrice : 'NULL'}, ${d.reasonCode ? esc(d.reasonCode) : 'NULL'}, ${d.reasonText ? esc(d.reasonText) : 'NULL'}, ${esc(d.decisionSnapshot)}, ${esc(d.decidedAt)});`);
  }

  lines.push('', '-- ─── Work Items (explicit ids so demo-run work_id stays aligned) ───', '');
  for (const w of demoWorkItems) {
    lines.push(`INSERT INTO work_items (id, business_id, title, source, customer_type, customer_name, customer_sub, location, travel, profit, hours, hours_num, rate, rate_num, recommendation, confidence, description, price, costs, cost_breakdown, reasons, photos, op_status, billing_status, preferred_date, phone, email, address, customer_notes, company_name, property_name, unit_label, work_order_number, requested_by, requested_by_role, requested_date, scope, service_type, estimation_run_id, created_at, completed_at) OVERRIDING SYSTEM VALUE VALUES (${w.id}, ${esc(MASON_BIZ_ID)}, ${esc(w.title)}, ${esc(w.source)}, ${esc(w.customerType)}, ${esc(w.customerName)}, ${w.customerSub ? esc(w.customerSub) : 'NULL'}, ${esc(w.location)}, ${esc(w.travel)}, ${w.profit}, ${esc(w.hours)}, ${w.hoursNum}, ${esc(w.rate)}, ${w.rateNum}, ${esc(w.recommendation)}, ${w.confidence}, ${esc(w.description)}, ${w.price}, ${w.costs}, ${esc(w.costBreakdown)}, ${esc(w.reasons)}, ${esc(w.photos)}, ${esc(w.opStatus)}, ${esc(w.billingStatus)}, ${w.preferredDate ? esc(w.preferredDate) : 'NULL'}, ${w.phone ? esc(w.phone) : 'NULL'}, ${w.email ? esc(w.email) : 'NULL'}, ${w.address ? esc(w.address) : 'NULL'}, ${w.customerNotes ? esc(w.customerNotes) : 'NULL'}, ${w.companyName ? esc(w.companyName) : 'NULL'}, ${w.propertyName ? esc(w.propertyName) : 'NULL'}, ${w.unitLabel ? esc(w.unitLabel) : 'NULL'}, ${w.workOrderNumber ? esc(w.workOrderNumber) : 'NULL'}, ${w.requestedBy ? esc(w.requestedBy) : 'NULL'}, ${w.requestedByRole ? esc(w.requestedByRole) : 'NULL'}, ${w.requestedDate ? esc(w.requestedDate) : 'NULL'}, ${w.scope ? esc(w.scope) : 'NULL'}, ${esc(w.serviceType)}, ${w.estimationRunId ? esc(w.estimationRunId) : 'NULL'}, ${w.createdAt ? esc(w.createdAt) : 'now()'}, ${w.completedAt ? esc(w.completedAt) : 'NULL'});`);
  }

  lines.push('', `SELECT setval(pg_get_serial_sequence('work_items', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM work_items), 1), 2012));`);
  return lines;
}

const generatedAt = new Date().toISOString();
const header = [
  '-- Auto-generated Mason Home Services engine output',
  '-- Generated by: npx tsx supabase/generate-seed-sql.ts',
  `-- Generated at: ${generatedAt}`,
  `-- Runs: ${demoEstimationRuns.length}  Adjustments: ${demoAdjustments.length}  Outcomes: ${demoOutcomes.length}  Decisions: ${demoOwnerDecisions.length}  Work items: ${demoWorkItems.length}`,
  '',
];

const wipe = [
  '-- Mason-only. Does not delete other businesses, customers, or the Mason auth user.',
  `DO $$ BEGIN`,
  `  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = '${MASON_BIZ_ID}') THEN`,
  `    RAISE EXCEPTION 'Mason business % not found. Run seed-mason-data.sql first.', '${MASON_BIZ_ID}';`,
  `  END IF;`,
  `END $$;`,
  '',
  'BEGIN;',
  '',
  `DELETE FROM work_items WHERE business_id = '${MASON_BIZ_ID}';`,
  `DELETE FROM owner_decisions WHERE estimation_run_id IN (SELECT id FROM estimation_runs WHERE business_id = '${MASON_BIZ_ID}') OR business_id = '${MASON_BIZ_ID}';`,
  `DELETE FROM actual_outcomes WHERE estimation_run_id IN (SELECT id FROM estimation_runs WHERE business_id = '${MASON_BIZ_ID}');`,
  `DELETE FROM adjustment_entries WHERE business_id = '${MASON_BIZ_ID}' OR estimation_run_id IN (SELECT id FROM estimation_runs WHERE business_id = '${MASON_BIZ_ID}');`,
  `DELETE FROM estimation_runs WHERE business_id = '${MASON_BIZ_ID}';`,
  '',
];

const inserts = insertBlock();
const seedOnly = [...header, '-- First-time seed: run migrations + seed-demo-user.sql + seed-mason-data.sql FIRST.', '', ...inserts, ''];
const refresh = [
  ...header,
  '-- PRODUCTION REFRESH: paste this whole file in the Supabase SQL editor.',
  '-- Requires migration 023 (completed_at) already applied.',
  '',
  ...wipe,
  ...inserts,
  '',
  'COMMIT;',
  '',
];

writeFileSync(join(__dirname, 'seed-data.sql'), seedOnly.join('\n') + '\n');
writeFileSync(join(__dirname, 'refresh-mason-production.sql'), refresh.join('\n') + '\n');
console.log(`Wrote seed-data.sql and refresh-mason-production.sql (${demoEstimationRuns.length} runs, ${demoWorkItems.length} work items)`);
