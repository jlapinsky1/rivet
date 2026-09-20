import { describe, it, expect } from 'vitest';
import { workItemStatusFields } from '../workItemStatus';

describe('workItemStatusFields', () => {
  it('stamps completed_at when the job is finished', () => {
    const patch = workItemStatusFields('completed');
    expect(patch.op_status).toBe('completed');
    expect(patch.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('clears completed_at when the job is not finished', () => {
    expect(workItemStatusFields('scheduled').completed_at).toBeNull();
    expect(workItemStatusFields('in_progress').completed_at).toBeNull();
  });
});
