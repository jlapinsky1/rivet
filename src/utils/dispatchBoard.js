/** Date-only stamp in a business timezone. Date columns stay as written. */
export function localYmd(value, timeZone) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'America/New_York' }).format(d);
}

/**
 * The jobs tab is today's board.
 * Open work (scheduled, in progress, or approved) stays up when it has no date,
 * or the date is today or earlier. A future date waits. Leaving the date empty
 * is how the Mason demo stays dispatchable the next morning.
 * Finished work shows only when it was completed today.
 */
export function includeOnTodaysBoard(item, todayStr, timeZone) {
  const status = item.op_status || item.opStatus;
  const preferred = localYmd(item.preferred_date || item.preferredDate, timeZone);
  if (status === 'completed') {
    const done = localYmd(item.completed_at || item.completedAt, timeZone) || preferred;
    return done === todayStr;
  }
  if (status !== 'scheduled' && status !== 'in_progress' && status !== 'approved') return false;
  if (!preferred) return true;
  return preferred <= todayStr;
}
