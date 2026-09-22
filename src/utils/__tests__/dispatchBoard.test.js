import { describe, expect, it } from 'vitest';
import { includeOnTodaysBoard, workItemToDispatchJob } from '../dispatchBoard';

const today = '2026-09-22';
const tz = 'America/New_York';

describe('includeOnTodaysBoard', () => {
  it('keeps an undated scheduled job on the board every day', () => {
    expect(includeOnTodaysBoard({ op_status: 'scheduled', preferred_date: null }, today, tz)).toBe(true);
  });

  it('hides a scheduled job dated in the future', () => {
    expect(includeOnTodaysBoard({ op_status: 'scheduled', preferred_date: '2026-09-23' }, today, tz)).toBe(false);
  });

  it('keeps an overdue scheduled job', () => {
    expect(includeOnTodaysBoard({ op_status: 'in_progress', preferred_date: '2026-09-21' }, today, tz)).toBe(true);
  });

  it('hides finished work from another day', () => {
    expect(includeOnTodaysBoard({
      op_status: 'completed',
      preferred_date: null,
      completed_at: '2026-08-16T17:00:00Z',
    }, today, tz)).toBe(false);
  });

  it('loads a work item as a dispatch job, not a booking', () => {
    const job = workItemToDispatchJob({
      id: 1009,
      op_status: 'scheduled',
      customer_name: 'Yolanda Freeman',
      title: 'Replace 6 rotted deck boards',
      address: '12 Oak St',
      phone: '6155550100',
      description: 'About 6 rotted deck boards',
      price: 633,
    });
    expect(job.id).toBe(1009);
    expect(job.source).toBe('work_item');
    expect(job.status).toBe('scheduled');
    expect(job.fullAddress).toBe('12 Oak St');
    expect(job.customerPhotos).toEqual([]);
    expect(job.crewBeforePhotoCount).toBe(0);
  });

  it('keeps customer photos separate from crew before and after shots', () => {
    const job = workItemToDispatchJob({
      id: 2003,
      op_status: 'in_progress',
      photos: [
        'https://example.com/customer.jpg',
        { source: 'crew', kind: 'before', url: 'https://example.com/before.jpg' },
        { source: 'crew', kind: 'after', url: 'https://example.com/after.jpg' },
      ],
    });
    expect(job.customerPhotos.map(p => p.signedUrl)).toEqual(['https://example.com/customer.jpg']);
    expect(job.crewBeforePhotos.map(p => p.signedUrl)).toEqual(['https://example.com/before.jpg']);
    expect(job.crewAfterPhotos.map(p => p.signedUrl)).toEqual(['https://example.com/after.jpg']);
  });

  it('shows work finished today', () => {
    expect(includeOnTodaysBoard({
      op_status: 'completed',
      completed_at: '2026-09-22T15:00:00Z',
    }, today, tz)).toBe(true);
  });
});
