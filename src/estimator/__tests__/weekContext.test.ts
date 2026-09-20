import { describe, it, expect } from 'vitest';
import { buildDecisionContext, parseTravelMiles } from '../weekContext';

describe('buildDecisionContext', () => {
  it('does not count needs_review or quoted as committed hours', () => {
    const ctx = buildDecisionContext([
      { opStatus: 'needs_review', profit: 300, hoursNum: 4 },
      { opStatus: 'quoted', profit: 200, hoursNum: 3 },
      { opStatus: 'completed', profit: 800, hoursNum: 10 },
    ], { weeklyGoal: 2500, weeklyHours: 35 });

    expect(ctx.weeklyEarningsToDate).toBe(800);
    expect(ctx.remainingCapacityHours).toBe(25);
    expect(ctx.requiredContributionPerCapacityHour).toBe(68);
  });

  it('treats scheduled and in_progress as committed', () => {
    const ctx = buildDecisionContext([
      { opStatus: 'completed', profit: 500, hoursNum: 8 },
      { opStatus: 'scheduled', profit: 400, hoursNum: 5 },
      { opStatus: 'in_progress', profit: 200, hoursNum: 2 },
    ], { weeklyGoal: 2500, weeklyHours: 35 });

    expect(ctx.weeklyEarningsToDate).toBe(1100);
    expect(ctx.remainingCapacityHours).toBe(20);
    expect(ctx.requiredContributionPerCapacityHour).toBe(70);
  });

  it('returns 0 needed rate when goal is already hit', () => {
    const ctx = buildDecisionContext([
      { opStatus: 'completed', profit: 2600, hoursNum: 20 },
    ], { weeklyGoal: 2500, weeklyHours: 35 });

    expect(ctx.requiredContributionPerCapacityHour).toBe(0);
    expect(ctx.remainingCapacityHours).toBe(15);
  });

  it('skips jobs marked as not counting toward the current week', () => {
    const ctx = buildDecisionContext([
      { opStatus: 'completed', profit: 2000, hoursNum: 20, countsTowardCurrentWeek: false },
      { opStatus: 'scheduled', profit: 400, hoursNum: 5 },
    ], { weeklyGoal: 2500, weeklyHours: 35 });

    expect(ctx.weeklyEarningsToDate).toBe(400);
    expect(ctx.remainingCapacityHours).toBe(30);
    expect(ctx.requiredContributionPerCapacityHour).toBe(70);
  });

  it('prefers capacityHours over hoursNum when present', () => {
    const ctx = buildDecisionContext([
      { opStatus: 'scheduled', profit: 300, hoursNum: 2, capacityHours: 4 },
    ], { weeklyGoal: 2500, weeklyHours: 35 });

    expect(ctx.remainingCapacityHours).toBe(31);
  });
});

describe('parseTravelMiles', () => {
  it('reads miles from travel labels', () => {
    expect(parseTravelMiles('12 mi')).toBe(12);
    expect(parseTravelMiles('8.5 miles')).toBe(8.5);
    expect(parseTravelMiles(undefined)).toBe(10);
  });
});
