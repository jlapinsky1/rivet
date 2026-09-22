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

const DISPATCH_STATUS = {
  scheduled: 'scheduled',
  in_progress: 'in_progress',
  completed: 'completed',
  approved: 'scheduled',
};

function photoUrl(entry) {
  if (typeof entry === 'string') return entry;
  if (entry?.url) return entry.url;
  return null;
}

/** Customer shots are plain URLs. Crew shots are { source: 'crew', kind, url }. */
export function splitWorkItemPhotos(photos) {
  const list = Array.isArray(photos) ? photos : [];
  const customer = [];
  const before = [];
  const after = [];
  list.forEach((entry, i) => {
    const url = photoUrl(entry);
    if (!url) return;
    if (entry && typeof entry === 'object' && entry.source === 'crew') {
      const shot = { id: `crew-${entry.kind}-${i}`, signedUrl: url, kind: entry.kind };
      if (entry.kind === 'after') after.push(shot);
      else before.push(shot);
      return;
    }
    customer.push({ id: `customer-${i}`, signedUrl: url, kind: 'before' });
  });
  return { customer, before, after };
}

/** Detail shape the jobs screen already uses. Work items are not bookings. */
export function workItemToDispatchJob(w) {
  const shots = splitWorkItemPhotos(w.photos);
  return {
    id: w.id,
    source: 'work_item',
    bookingRef: null,
    status: DISPATCH_STATUS[w.op_status] || 'scheduled',
    depositConfirmed: true,
    appointmentDate: w.preferred_date ?? null,
    appointmentWindow: null,
    scheduledPickup: null,
    customerName: w.customer_name ?? null,
    customerPhone: w.phone ?? null,
    fullAddress: w.address ?? null,
    accessInstructions: null,
    quantity: null,
    accessType: null,
    stairs: null,
    elevator: null,
    description: w.description ?? null,
    internalJobNotes: w.customer_notes ?? null,
    title: w.title ?? null,
    price: w.price ?? null,
    hours: w.hours ?? null,
    travel: w.travel ?? null,
    enRouteAt: null,
    arrivedAt: null,
    startedAt: null,
    completedAt: w.completed_at ?? null,
    customerPhotos: shots.customer,
    crewBeforePhotos: shots.before,
    crewAfterPhotos: shots.after,
    crewBeforePhotoCount: shots.before.length,
    crewAfterPhotoCount: shots.after.length,
  };
}
