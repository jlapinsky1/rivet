/**
 * Supabase repository — production mode.
 *
 * Admin operations use the authenticated Supabase client (RLS-protected).
 * Customer operations call Netlify functions (which use the service role key).
 */

import { supabase } from '../supabaseClient';

/**
 * Converts a raw Supabase booking row (snake_case) to the camelCase shape
 * expected by the admin UI and utility functions (estimateBuilder, riskFlags, etc.).
 */
function normalizeBooking(row) {
  if (!row) return row;
  return {
    // Pass-through fields that are already fine (id, status, address, city, state, zip, quantity, stairs, elevator, description, actuals)
    ...row,
    // Customer
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    // Address
    fullAddress: row.full_address,
    // Request details
    accessType: row.access_type,
    detectedItems: row.detected_items ?? [],
    aiDetectedItems: row.ai_detected_items ?? [],
    photoCount: row.photo_count ?? 0,
    // Scheduling
    preferredDate: row.preferred_date,
    secondChoiceDate: row.second_choice_date,
    timePreference: row.time_preference,
    // Quote lifecycle
    quoteVersion: row.quote_version,
    approvedQuote: row.approved_quote,
    quoteExpiresAt: row.quote_expires_at,
    approvedAt: row.approved_at,
    quoteTokenHash: row.quote_token_hash,
    availableSlots: row.available_slots ?? [],
    // Acceptance
    acceptedAt: row.accepted_at,
    scheduledPickup: row.scheduled_pickup,
    // Internal
    internalNotes: row.internal_notes ?? '',
    internalEstimate: row.internal_estimate,
    riskFlags: row.risk_flags,
    jobRating: row.job_rating,
    blockerOverrides: row.blocker_overrides ?? {},
    // Stripe
    stripeCustomerId: row.stripe_customer_id,
    stripeInvoiceId: row.stripe_invoice_id,
    depositConfirmedAt: row.deposit_confirmed_at,
    // Completion
    completedAt: row.completed_at,
    // Geocoding / distance
    geocodedLat: row.geocoded_lat,
    geocodedLng: row.geocoded_lng,
    geocodingStatus: row.geocoding_status,
    distanceMiles: row.distance_miles != null ? Number(row.distance_miles) : null,
    travelMinutes: row.travel_minutes_one_way ?? null,
    // Timestamps
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Misc
    idempotencyKey: row.idempotency_key,
    uploadSessionId: row.upload_session_id,
    testRunId: row.test_run_id,
  };
}

// Cached business context for the current session
let _businessContext = null;

async function getBusinessContext() {
  if (_businessContext) return _businessContext;

  const { data, error } = await supabase
    .from('business_memberships')
    .select('business_id, role, businesses:business_id(id, name, slug, vertical, timezone, settings)')
    .limit(1)
    .single();

  if (error || !data) return null;
  _businessContext = {
    businessId: data.business_id,
    role: data.role,
    business: data.businesses,
  };
  return _businessContext;
}

// Clear cached context on auth state change
supabase.auth.onAuthStateChange(() => { _businessContext = null; });

async function adminFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const ctx = await getBusinessContext();

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...(ctx?.businessId && { 'x-business-id': ctx.businessId }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

const supabaseRepo = {
  mode: 'supabase',

  // ── Business Context ──
  getBusinessContext,

  async getBusinessSettings() {
    const ctx = await getBusinessContext();
    if (!ctx?.business?.settings) return null;
    return ctx.business.settings;
  },

  async saveBusinessSettings(settings) {
    const ctx = await getBusinessContext();
    if (!ctx?.businessId) throw new Error('No business context');
    const { error } = await supabase
      .from('businesses')
      .update({ settings })
      .eq('id', ctx.businessId);
    if (error) throw error;
    // Invalidate cached context so next read picks up new settings
    _businessContext = null;
    return true;
  },

  // ── Auth ──
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  },

  // ── Admin reads (direct Supabase, RLS-protected) ──
  async getBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeBooking);
  },

  async getBookingById(id) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return normalizeBooking(data);
  },

  async getSnapshotsForBooking(bookingId) {
    const { data, error } = await supabase
      .from('quote_snapshots')
      .select('*')
      .eq('booking_id', bookingId)
      .order('version', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getAcceptanceForBooking(bookingId) {
    const { data, error } = await supabase
      .from('quote_acceptances')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getReservationsForBooking(bookingId) {
    const { data, error } = await supabase
      .from('slot_reservations')
      .select('*')
      .eq('booking_id', bookingId)
      .order('reserved_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // ── Upload session (customer, via Netlify functions) ──
  async createUploadSession(turnstileToken) {
    const res = await fetch('/api/create-upload-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstileToken }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to create upload session');
    }
    return res.json();
  },

  // ── Customer submission (via Netlify function) ──
  async createBooking(bookingData) {
    const res = await fetch('/api/create-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Submission failed');
    }
    return res.json();
  },

  // ── Admin writes (via Netlify functions, auth-protected) ──
  async updateBooking(id, updates) {
    const { error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async approveBooking(id, data) {
    return adminFetch('/api/approve-quote', {
      method: 'POST',
      body: JSON.stringify({ bookingId: id, ...data }),
    });
  },

  async completeBooking(id, actuals) {
    return adminFetch('/api/complete-job', {
      method: 'POST',
      body: JSON.stringify({ bookingId: id, actuals }),
    });
  },

  async deleteBooking(id) {
    const { error } = await supabase.rpc('admin_delete_booking', { p_booking_id: id });
    if (error) throw error;
  },

  // ── Customer quote (via Netlify function, token-protected) ──
  async getCustomerQuote(token) {
    const res = await fetch(`/api/get-customer-quote?token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    return res.json();
  },

  // ── Customer acceptance (via Netlify function, token-protected) ──
  async acceptQuote(token, data) {
    const res = await fetch('/api/accept-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...data }),
    });
    return res.json();
  },

  // ── Slots (admin reads from DB) ──
  async getBookedSlots() {
    const { data, error } = await supabase
      .from('slot_reservations')
      .select('resource_id, pickup_date, start_time, end_time, status')
      .in('status', ['reserved', 'confirmed']);
    if (error) throw error;
    return data;
  },

  async isSlotBooked(resourceId, pickupDate, startTime) {
    const { count, error } = await supabase
      .from('slot_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('resource_id', resourceId || 'truck-1')
      .eq('pickup_date', pickupDate)
      .eq('start_time', startTime)
      .in('status', ['reserved', 'confirmed']);
    if (error) throw error;
    return count > 0;
  },

  // ── Photos ──
  async getUploadUrl(sessionId, fileName, contentType) {
    const res = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, fileName, contentType }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to get upload URL');
    }
    return res.json();
  },

  async getPhotoUrls(bookingId) {
    const { data, error } = await supabase
      .from('booking_photos')
      .select('storage_path, file_name, sort_order')
      .eq('booking_id', bookingId)
      .order('sort_order');
    if (error) throw error;

    return Promise.all(data.map(async (photo) => {
      const { data: urlData } = await supabase.storage
        .from('booking-photos')
        .createSignedUrl(photo.storage_path, 3600);
      return {
        url: urlData?.signedUrl || '',
        path: photo.storage_path,
        name: photo.file_name,
      };
    }));
  },

  // ── Business Goals ──
  async getActiveGoal(goalType = 'cash_profit') {
    const { data, error } = await supabase
      .from('business_goals')
      .select('*')
      .eq('goal_type', goalType)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertGoal(goalData) {
    const ctx = await getBusinessContext();
    const withBiz = { ...goalData, business_id: ctx?.businessId };

    // Deactivate existing active goal of same type first
    if (goalData.active !== false) {
      await supabase
        .from('business_goals')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('goal_type', goalData.goal_type)
        .eq('active', true);
    }
    const { data, error } = await supabase
      .from('business_goals')
      .upsert(withBiz)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async saveGoalSnapshot(snapshot) {
    const ctx = await getBusinessContext();
    const { error } = await supabase
      .from('goal_snapshots')
      .upsert({ ...snapshot, business_id: ctx?.businessId }, { onConflict: 'goal_id,snapshot_date' });
    if (error) throw error;
  },

  async getCompletedBookingsInRange(startDate, endDate) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, approved_quote, actuals, internal_estimate, completed_at, status')
      .eq('status', 'completed')
      .gte('completed_at', startDate)
      .lte('completed_at', endDate + 'T23:59:59Z');
    if (error) throw error;
    return data || [];
  },

  async getActiveBookingsByStatus(statuses) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, approved_quote, internal_estimate, created_at')
      .in('status', statuses)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getScheduledBookingsForDateRange(startDate, endDate) {
    const { data, error } = await supabase
      .from('slot_reservations')
      .select(`
        booking_id, pickup_date, start_time, end_time, resource_id, status,
        bookings:booking_id (id, status, approved_quote, internal_estimate, actuals, full_address, quantity, access_type, completed_at)
      `)
      .gte('pickup_date', startDate)
      .lte('pickup_date', endDate)
      .in('status', ['reserved', 'confirmed', 'completed']);
    if (error) throw error;
    return data || [];
  },

  // ── Calibration ──
  async getCalibrationRecords(status = null) {
    let query = supabase
      .from('calibration_records')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('owner_decision', status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async upsertCalibrationRecord(record) {
    const ctx = await getBusinessContext();
    const { data, error } = await supabase
      .from('calibration_records')
      .upsert({ ...record, business_id: ctx?.businessId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── Location / Travel Cache ──
  async getLocationCache(addressHash) {
    const { data, error } = await supabase
      .from('location_cache')
      .select('*')
      .eq('address_hash', addressHash)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertLocationCache(entry) {
    const { error } = await supabase
      .from('location_cache')
      .upsert(entry, { onConflict: 'address_hash' });
    if (error) throw error;
  },

  async getTravelCache(originHash, destinationHash) {
    const { data, error } = await supabase
      .from('travel_cache')
      .select('*')
      .eq('origin_hash', originHash)
      .eq('destination_hash', destinationHash)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertTravelCache(entry) {
    const { error } = await supabase
      .from('travel_cache')
      .upsert(entry, { onConflict: 'origin_hash,destination_hash' });
    if (error) throw error;
  },

  // ── Completed bookings (admin, server-side search) ──
  async searchCompletedBookings({ search = '', dateFrom = '', dateTo = '', paymentStatus = '', page = 1 } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (paymentStatus) params.set('paymentStatus', paymentStatus);
    params.set('page', String(page));
    return adminFetch(`/api/get-admin-completed-bookings?${params.toString()}`);
  },

  async getCompletionDetail(bookingId) {
    return adminFetch(`/api/get-admin-completion-detail?bookingId=${encodeURIComponent(bookingId)}`);
  },

  // ── Support notes ──
  async getSupportNotes(bookingId) {
    const { data, error } = await supabase
      .from('support_notes')
      .select('id, note_text, admin_email, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async addSupportNote(bookingId, noteText) {
    return adminFetch('/api/admin-support-note', {
      method: 'POST',
      body: JSON.stringify({ bookingId, noteText }),
    });
  },

  // ── Payment actions (admin) ──
  async adminPaymentAction(bookingId, action) {
    return adminFetch('/api/admin-payment-action', {
      method: 'POST',
      body: JSON.stringify({ bookingId, action }),
    });
  },

  async getPaymentSummary(bookingId) {
    return adminFetch(`/api/payment-summary?bookingId=${encodeURIComponent(bookingId)}`);
  },

  // ── Audit (admin reads) ──
  async getAuditLog(bookingId) {
    let query = supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false });
    if (bookingId) query = query.eq('booking_id', bookingId);
    const { data, error } = await query.limit(100);
    if (error) throw error;
    return data;
  },

  async appendAuditEntry(entry) {
    const ctx = await getBusinessContext();
    const { error } = await supabase.from('audit_log').insert({ ...entry, business_id: ctx?.businessId });
    if (error) throw error;
  },

  // ── Dispatch ──
  async getDispatchJobsToday() {
    return adminFetch('/api/dispatch-jobs-today');
  },

  async getDispatchJob(bookingId) {
    return adminFetch(`/api/dispatch-job?bookingId=${encodeURIComponent(bookingId)}`);
  },

  async updateDispatchStatus(bookingId, targetStatus, idempotencyKey) {
    return adminFetch('/api/dispatch-status', {
      method: 'POST',
      body: JSON.stringify({ bookingId, targetStatus, idempotencyKey }),
    });
  },

  async getDispatchPhotoUploadUrl(bookingId, fileName, contentType, kind) {
    return adminFetch('/api/dispatch-photo-upload-url', {
      method: 'POST',
      body: JSON.stringify({ bookingId, fileName, contentType, kind }),
    });
  },

  async saveDispatchPhoto(data) {
    return adminFetch('/api/dispatch-photo', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async reportDispatchIssue(data) {
    return adminFetch('/api/dispatch-report-issue', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async dispatchCompleteJob(data) {
    return adminFetch('/api/dispatch-complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export default supabaseRepo;
