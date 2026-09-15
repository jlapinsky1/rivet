/**
 * localStorage repository - development/demo mode only.
 *
 * This implementation has known limitations:
 *   - Single-browser only (no cross-device access)
 *   - No atomic slot reservation (race conditions possible)
 *   - No auth enforcement
 *   - Internal data accessible via browser DevTools
 */

import {
  getBookings as _getBookings,
  getBookingById as _getBookingById,
  saveBooking as _saveBooking,
  updateBooking as _updateBooking,
  approveBooking as _approveBooking,
  acceptQuote as _acceptQuote,
  completeBooking as _completeBooking,
  deleteBooking as _deleteBooking,
  getBookedSlots as _getBookedSlots,
  isSlotBooked as _isSlotBooked,
  getAuditLog as _getAuditLog,
  appendAuditEntry as _appendAuditEntry,
  getCustomerView as _getCustomerView,
} from '../bookings';

const local = {
  mode: 'local',

  // ── Auth (no-op in local mode) ──
  async signIn() { return { user: { id: 'local-admin', email: 'admin@local' } }; },
  async signOut() {},
  async getSession() { return { id: 'local-admin', email: 'admin@local' }; },
  onAuthStateChange(callback) {
    // No-op in local mode - return subscription-like object
    return { data: { subscription: { unsubscribe() {} } } };
  },

  // ── Admin reads ──
  async getBookings() { return _getBookings(); },
  async getBookingById(id) { return _getBookingById(id); },

  // ── Customer submission ──
  async createBooking(data) { return { id: _saveBooking(data) }; },

  // ── Admin writes ──
  async updateBooking(id, updates) { return _updateBooking(id, updates); },
  async approveBooking(id, data) { return _approveBooking(id, data); },
  async completeBooking(id, actuals) { return _completeBooking(id, actuals); },
  async deleteBooking(id) { return _deleteBooking(id); },

  // ── Customer quote ──
  async getCustomerQuote(token) {
    // In local mode, token = booking ID
    const booking = _getBookingById(token);
    return booking ? _getCustomerView(booking) : null;
  },

  // ── Customer acceptance ──
  async acceptQuote(id, data) { return _acceptQuote(id, data); },

  // ── Slots ──
  async getBookedSlots() { return _getBookedSlots(); },
  async isSlotBooked(slot) { return _isSlotBooked(slot); },

  // ── Audit ──
  async getAuditLog() { return _getAuditLog(); },
  async appendAuditEntry(entry) { return _appendAuditEntry(entry); },

  // ── Upload session (no-op in local mode) ──
  async createUploadSession() {
    return { sessionId: 'local-session', maxPhotos: 10, maxFileBytes: 10485760 };
  },

  // ── Photos ──
  async getUploadUrl() {
    return { url: null, path: null };
  },
  async getPhotoUrls(bookingId) {
    const booking = _getBookingById(bookingId);
    return (booking?.photos || []).map((dataUrl, i) => ({
      url: dataUrl,
      path: `local/${i}`,
    }));
  },

  // ── Snapshots / Acceptances / Reservations (stubs for local) ──
  async getSnapshotsForBooking() { return []; },
  async getAcceptanceForBooking() { return null; },
  async getReservationsForBooking() { return []; },

  // ── Goal tracking (localStorage for local dev) ──
  async getActiveGoal(goalType = 'cash_profit') {
    try {
      const stored = localStorage.getItem('junkremoval_goals');
      const goals = stored ? JSON.parse(stored) : [];
      return goals.find(g => g.goal_type === goalType && g.active) || null;
    } catch { return null; }
  },
  async upsertGoal(goalData) {
    try {
      const stored = localStorage.getItem('junkremoval_goals');
      let goals = stored ? JSON.parse(stored) : [];
      // Deactivate existing active goals of same type
      goals = goals.map(g =>
        g.goal_type === goalData.goal_type && g.active ? { ...g, active: false } : g
      );
      const saved = { ...goalData, id: goalData.id || crypto.randomUUID() };
      const idx = goals.findIndex(g => g.id === saved.id);
      if (idx >= 0) { goals[idx] = saved; } else { goals.push(saved); }
      localStorage.setItem('junkremoval_goals', JSON.stringify(goals));
      return saved;
    } catch { return goalData; }
  },
  async saveGoalSnapshot() {},
  async getCompletedBookingsInRange() { return []; },
  async getActiveBookingsByStatus() { return []; },
  async getScheduledBookingsForDateRange() { return []; },

  // ── Calibration (stubs for local) ──
  async getCalibrationRecords() { return []; },
  async upsertCalibrationRecord(record) { return record; },

  // ── Location / Travel cache (stubs for local) ──
  async getLocationCache() { return null; },
  async upsertLocationCache() {},
  async getTravelCache() { return null; },
  async upsertTravelCache() {},

  // ── Completed bookings & support (stubs for local - requires Supabase) ──
  async searchCompletedBookings() {
    const all = _getBookings().filter(b => b.status === 'completed');
    return { data: all, total: all.length, page: 1, perPage: 25, totalPages: 1 };
  },
  async getCompletionDetail(bookingId) {
    const booking = _getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');
    return {
      booking: {
        id: booking.id,
        bookingRef: `RES-${booking.id.slice(0, 8).toUpperCase()}`,
        status: booking.status,
        customerName: booking.customerName || null,
        customerPhone: booking.customerPhone || null,
        customerEmail: booking.customerEmail || null,
        fullAddress: booking.fullAddress || null,
        approvedQuote: booking.approvedQuote || null,
        completedAt: booking.completedAt || null,
        depositConfirmedAt: null,
        financiallyCompletedAt: null,
        stripeCustomerId: null,
        stripeInvoiceId: null,
        stripeFinalPaymentIntentId: null,
        internalEstimate: booking.estimate || null,
        actuals: booking.actuals || null,
        createdAt: booking.createdAt || null,
      },
      completion: null,
      photos: { before: [], after: [] },
      timeline: [],
      supportNotes: [],
    };
  },
  async getSupportNotes() { return []; },
  async addSupportNote(bookingId, noteText) {
    return { note: { id: crypto.randomUUID(), noteText, adminEmail: 'local@dev', createdAt: new Date().toISOString() } };
  },
  async adminPaymentAction() { throw new Error('Payment actions require Supabase'); },
  async getPaymentSummary() { throw new Error('Payment summary requires Supabase'); },
};

export default local;
