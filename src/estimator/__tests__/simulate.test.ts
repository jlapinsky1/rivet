import { describe, it, expect } from 'vitest';
import { estimateHandymanJob, applyCalibration } from '../estimator';
import {
  MASON_SOLO_BUDGET,
  contextFromWeekPosition,
  defaultWeekScenarios,
  runSimulation,
} from '../simulate';
import { defaultBusinessEconomicsConfig } from '../types';
import type { ExtractionResult } from '../types';

const extraction: ExtractionResult = {
  tradeContexts: ['tv_wall_mounting'],
  assemblyCandidate: 'STANDARD_TV_MOUNT',
  assemblyConfidence: 0.9,
  tasks: [],
  conditions: [],
  unknowns: [],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.88,
  rawDescription: 'Mount a TV',
};

describe('week simulation', () => {
  it('Monday empty week needs goal / hours per schedule hour', () => {
    const ctx = contextFromWeekPosition(MASON_SOLO_BUDGET, 0, 35);
    expect(ctx.requiredContributionPerCapacityHour).toBe(71.43);
    expect(ctx.remainingCapacityHours).toBe(35);
  });

  it('default scenarios are monday / midweek / friday', () => {
    const ids = defaultWeekScenarios(MASON_SOLO_BUDGET).map(s => s.id);
    expect(ids).toEqual(['monday', 'midweek', 'friday']);
  });

  it('same clear job can flip Take → Take at price as Friday pace tightens', () => {
    const config = defaultBusinessEconomicsConfig('sim');
    const economicJob = applyCalibration(estimateHandymanJob(extraction), config, null, 10);
    const report = runSimulation(
      [{ id: 'tv', title: 'Mount TV', economicJob }],
      MASON_SOLO_BUDGET,
    );
    const monday = report.scenarios.find(s => s.scenario.id === 'monday')!.jobs[0];
    const friday = report.scenarios.find(s => s.scenario.id === 'friday')!.jobs[0];
    expect(['take', 'take_at_price']).toContain(monday.recommendation);
    expect(friday.recommendation).toBe('take_at_price');
    expect(report.recChanges.some(r => r.id === 'tv') || monday.recommendation !== friday.recommendation).toBe(true);
  });
});
