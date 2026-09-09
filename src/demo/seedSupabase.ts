/**
 * Seed script — inserts estimation runs, adjustments, and outcomes into Supabase.
 *
 * Run via: npx tsx src/demo/seedSupabase.ts
 *
 * This uses the same persistence layer as the real app.
 * Safe to run multiple times — will log errors on duplicate IDs.
 */

import { demoEstimationRuns, demoAdjustments, demoOutcomes } from './seed';
import { saveEstimationRun, saveAdjustment, saveOutcome } from '../estimator/persistence';

async function seed() {
  console.log(`Seeding ${demoEstimationRuns.length} estimation runs...`);
  for (const run of demoEstimationRuns) {
    try {
      await saveEstimationRun(run);
      console.log(`  ✓ ${run.id}`);
    } catch (e) {
      console.log(`  ✗ ${run.id}: ${(e as Error).message}`);
    }
  }

  console.log(`\nSeeding ${demoAdjustments.length} adjustment entries...`);
  for (const adj of demoAdjustments) {
    try {
      await saveAdjustment(adj);
      console.log(`  ✓ ${adj.id} (${adj.field} on ${adj.estimationRunId})`);
    } catch (e) {
      console.log(`  ✗ ${adj.id}: ${(e as Error).message}`);
    }
  }

  console.log(`\nSeeding ${demoOutcomes.length} actual outcomes...`);
  for (const outcome of demoOutcomes) {
    try {
      await saveOutcome(outcome);
      console.log(`  ✓ ${outcome.id} (run ${outcome.estimationRunId})`);
    } catch (e) {
      console.log(`  ✗ ${outcome.id}: ${(e as Error).message}`);
    }
  }

  console.log('\nDone.');
}

seed();
