import { describe, it, expect } from 'vitest';
import { buildTuningReport, renderTuningReportMarkdown, weekWindow } from '../tuningReport';
import type { TuningEvent } from '../tuningReport';

function ev(partial: Partial<TuningEvent> & Pick<TuningEvent, 'rec' | 'action'>): TuningEvent {
  return {
    decidedAt: '2026-09-18T12:00:00Z',
    businessId: 'biz',
    projectFamily: 'drywall_repair',
    reasonCode: undefined,
    rivetPrice: 200,
    ownerPrice: 200,
    ...partial,
  };
}

describe('buildTuningReport', () => {
  const { since, until } = weekWindow(new Date('2026-09-20T18:00:00Z'));

  it('counts a Pass they took as a miss', () => {
    const report = buildTuningReport([
      ev({ rec: 'pass', action: 'approved', reasonCode: 'REC_OVERRIDE_PASS' }),
      ev({ rec: 'pass', action: 'approved_adjusted', reasonCode: 'REC_OVERRIDE_PASS', ownerPrice: 240 }),
      ev({ rec: 'take', action: 'approved' }),
    ], since, until);
    expect(report.decisions).toBe(3);
    expect(report.misses).toBe(2);
    expect(report.passTaken).toBe(2);
    expect(report.suggestedTunes[0]).toMatch(/Passed/i);
  });

  it('ignores reviewed_later and rows outside the week', () => {
    const report = buildTuningReport([
      ev({ rec: 'take', action: 'reviewed_later', decidedAt: '2026-09-18T12:00:00Z' }),
      ev({ rec: 'pass', action: 'approved', decidedAt: '2026-08-01T12:00:00Z' }),
    ], since, until);
    expect(report.decisions).toBe(0);
    expect(report.suggestedTunes[0]).toMatch(/Nothing to tune/);
  });

  it('renders markdown with miss rows', () => {
    const report = buildTuningReport([
      ev({ rec: 'take', action: 'declined', reasonCode: 'REC_SHOULD_HAVE_PASSED' }),
      ev({ rec: 'take', action: 'declined', reasonCode: 'REC_SHOULD_HAVE_PASSED', projectFamily: 'fence_repair' }),
    ], since, until);
    const md = renderTuningReportMarkdown(report);
    expect(md).toContain('REC_SHOULD_HAVE_PASSED');
    expect(md).toContain('should have been a Pass');
  });
});
