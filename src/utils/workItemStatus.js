/** Patch for work_items when operational status changes. */
export function workItemStatusFields(nextStatus) {
  const now = new Date().toISOString();
  return {
    op_status: nextStatus,
    updated_at: now,
    completed_at: nextStatus === 'completed' ? now : null,
  };
}
