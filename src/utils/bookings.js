/**
 * Booking data layer.
 *
 * PRODUCTION TODO: This module uses browser localStorage.
 * For production, replace with a shared persistent store (e.g. Supabase)
 * to support:
 *   - Customer submissions visible across devices
 *   - Cross-device admin review
 *   - Atomic slot reservation (see accept-quote Netlify function)
 *   - Data separation between customer-facing and internal fields
 *
 * Minimum viable migration:
 *   - Supabase tables: bookings, quote_snapshots, slot_reservations, audit_log
 *   - Netlify function for slot acceptance (atomic transaction)
 *   - Row-level security to separate customer/admin access
 */

const BOOKINGS_KEY = 'junkremoval_bookings';
const BOOKED_SLOTS_KEY = 'junkremoval_booked_slots';
const AUDIT_LOG_KEY = 'junkremoval_audit_log';

// ── Read ────────────────────────────────────────────────────

export function getBookings() {
  try {
    const stored = localStorage.getItem(BOOKINGS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to load bookings:', e);
    return [];
  }
}

export function getBookingById(id) {
  return getBookings().find(b => b.id === id) || null;
}

// ── Create ──────────────────────────────────────────────────

export function saveBooking(booking) {
  const bookings = getBookings();
  const id = crypto.randomUUID();
  const newBooking = {
    ...booking,
    id,
    status: 'pending_review',
    createdAt: new Date().toISOString(),

    // Scheduling: preferences (not confirmed)
    preferredDate: booking.preferredDate || null,
    secondChoiceDate: booking.secondChoiceDate || null,
    timePreference: booking.timePreference || booking.preferredTime || null,

    // AI detection snapshot (preserved separately for mismatch detection)
    aiDetectedItems: booking.detectedItems ? [...booking.detectedItems] : [],

    // Internal fields (never exposed to customer)
    internalEstimate: null,
    internalNotes: '',
    riskFlags: null,
    confidence: null,
    jobRating: null,

    // Quote lifecycle
    quoteVersion: 0,
    quoteSnapshots: [],
    approvedAt: null,
    approvedQuote: null,
    quoteExpiresAt: null,
    availableSlots: [],

    // Acceptance record
    acceptance: null,

    // Completion actuals
    actuals: null,
    completedAt: null,

    // Audit
    priceOverrides: [],
  };
  bookings.unshift(newBooking);
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  return id;
}

// ── Update ──────────────────────────────────────────────────

export function updateBooking(id, updates) {
  const bookings = getBookings();
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return false;
  bookings[index] = { ...bookings[index], ...updates };
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  return true;
}

// ── Approve (with immutable snapshot) ───────────────────────

export function approveBooking(id, { approvedQuote, quoteExpiresAt, availableSlots, quoteSnapshot }) {
  const bookings = getBookings();
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return false;

  const booking = bookings[index];
  const newVersion = (booking.quoteVersion || 0) + 1;

  // Append snapshot to history (immutable record)
  const snapshots = [...(booking.quoteSnapshots || [])];
  if (quoteSnapshot) {
    snapshots.push(quoteSnapshot);
  }

  bookings[index] = {
    ...booking,
    status: 'quote_sent',
    approvedQuote,
    quoteExpiresAt,
    availableSlots: availableSlots || [],
    approvedAt: new Date().toISOString(),
    quoteVersion: newVersion,
    quoteSnapshots: snapshots,
  };

  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  return true;
}

// ── Accept (customer accepts quote) ─────────────────────────

/**
 * Accept a quote and reserve a slot.
 *
 * PRODUCTION TODO: This must be an atomic server-side operation.
 * The current localStorage implementation has a race condition.
 * Replace with a Netlify function that:
 *   1. Checks slot availability in the database
 *   2. Inserts a slot_reservation row (unique constraint prevents double-booking)
 *   3. Updates booking status in a single transaction
 *   4. Returns success or conflict error
 */
export function acceptQuote(id, { scheduledPickup, acceptedPrice, quoteVersion, confirmations }) {
  // Check slot availability (client-side - NOT sufficient for production)
  const bookedSlots = getBookedSlots();
  if (scheduledPickup && bookedSlots.includes(scheduledPickup)) {
    return { success: false, error: 'slot_taken' };
  }

  const bookings = getBookings();
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return { success: false, error: 'not_found' };

  const booking = bookings[index];

  // Check expiration
  if (booking.quoteExpiresAt && new Date(booking.quoteExpiresAt) < new Date()) {
    return { success: false, error: 'expired' };
  }

  const acceptance = {
    acceptedAt: new Date().toISOString(),
    selectedSlot: scheduledPickup,
    acceptedPrice: acceptedPrice || booking.approvedQuote,
    quoteVersion: quoteVersion || booking.quoteVersion,
    confirmations: confirmations || [],
    termsAccepted: true,
  };

  bookings[index] = {
    ...booking,
    status: 'scheduled',
    scheduledPickup,
    acceptedAt: acceptance.acceptedAt,
    acceptance,
  };

  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));

  // Reserve the slot
  if (scheduledPickup) {
    reserveSlot(scheduledPickup, id);
  }

  return { success: true };
}

// ── Complete ────────────────────────────────────────────────

export function completeBooking(id, actuals) {
  return updateBooking(id, {
    status: 'completed',
    actuals,
    completedAt: new Date().toISOString(),
  });
}

// ── Delete ──────────────────────────────────────────────────

export function deleteBooking(id) {
  const bookings = getBookings().filter(b => b.id !== id);
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
}

// ── Slot management ─────────────────────────────────────────
// PRODUCTION TODO: Replace with database unique constraint.

export function getBookedSlots() {
  try {
    const stored = localStorage.getItem(BOOKED_SLOTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function reserveSlot(slot, bookingId) {
  const slots = getBookedSlots();
  if (!slots.includes(slot)) {
    slots.push(slot);
    localStorage.setItem(BOOKED_SLOTS_KEY, JSON.stringify(slots));
  }
}

export function isSlotBooked(slot) {
  return getBookedSlots().includes(slot);
}

// ── Audit log ───────────────────────────────────────────────

export function getAuditLog() {
  try {
    const stored = localStorage.getItem(AUDIT_LOG_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function appendAuditEntry(entry) {
  const log = getAuditLog();
  log.unshift(entry);
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
}

// ── Customer-safe view ──────────────────────────────────────

/**
 * Returns only customer-safe fields from a booking.
 * PRODUCTION TODO: Enforce this at the API layer, not just the client.
 */
export function getCustomerView(booking) {
  if (!booking) return null;
  return {
    id: booking.id,
    status: booking.status,
    customerName: booking.customerName,
    fullAddress: booking.fullAddress,
    quantity: booking.quantity,
    approvedQuote: booking.approvedQuote,
    quoteExpiresAt: booking.quoteExpiresAt,
    availableSlots: booking.availableSlots,
    scheduledPickup: booking.scheduledPickup,
    acceptance: booking.acceptance,
    // Customer terms from latest snapshot
    customerTerms: booking.quoteSnapshots?.length > 0
      ? booking.quoteSnapshots[booking.quoteSnapshots.length - 1].customerTerms
      : null,
  };
}

// ── Status config ───────────────────────────────────────────

export const STATUS_LABELS = {
  pending_review: 'Pending Review',
  quote_sent: 'Quote Sent',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
};

export const STATUS_COLORS = {
  pending_review: 'bg-amber-100 text-amber-800',
  quote_sent: 'bg-blue-100 text-blue-800',
  scheduled: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  declined: 'bg-red-100 text-red-800',
};
