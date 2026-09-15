import {
  getServiceClient, verifyAdmin,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

const PER_PAGE = 25;

/**
 * GET /api/get-admin-completed-bookings
 *
 * Admin-only. Returns paginated, filtered, searchable list of completed bookings.
 *
 * Query params:
 *   search       - searches customer_name, email, phone, address, stripe_invoice_id, booking ref
 *   dateFrom     - ISO date string, filter by completed_at >=
 *   dateTo       - ISO date string, filter by completed_at <=
 *   paymentStatus - 'paid' | 'balance_due' | '' (all)
 *   page         - page number (default 1)
 */
export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const url = new URL(req.url, 'http://localhost');
    const search = url.searchParams.get('search')?.trim() || '';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    const paymentStatus = url.searchParams.get('paymentStatus') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * PER_PAGE;

    const supabase = getServiceClient();

    let query = supabase
      .from('bookings')
      .select(
        `id, customer_name, customer_phone, customer_email, full_address,
         approved_quote, completed_at, deposit_confirmed_at, financially_completed_at,
         stripe_invoice_id, created_at,
         booking_completions (technician_name, final_amount_cents, completed_at),
         booking_photos (id, kind)`,
        { count: 'exact' }
      )
      .eq('status', 'completed');

    // ── Search ─────────────────────────────────────────────────────────────
    if (search) {
      // Detect booking-ref format: "RES-8F31A2C4" → search id prefix "8f31a2c4"
      const refMatch = search.match(/^RES-?([0-9A-Fa-f]{1,8})/i);
      const idPrefix = refMatch ? refMatch[1].toLowerCase() : null;

      const orParts = [
        `customer_name.ilike.%${search}%`,
        `customer_email.ilike.%${search}%`,
        `customer_phone.ilike.%${search}%`,
        `full_address.ilike.%${search}%`,
        `stripe_invoice_id.ilike.%${search}%`,
      ];
      // UUID cast for booking ref search
      if (idPrefix) {
        orParts.push(`id::text.ilike.${idPrefix}%`);
      }

      query = query.or(orParts.join(','));
    }

    // ── Date range ─────────────────────────────────────────────────────────
    if (dateFrom) query = query.gte('completed_at', dateFrom);
    if (dateTo) query = query.lte('completed_at', dateTo + 'T23:59:59Z');

    // ── Payment status ─────────────────────────────────────────────────────
    if (paymentStatus === 'paid') {
      query = query.not('financially_completed_at', 'is', null);
    } else if (paymentStatus === 'balance_due') {
      query = query.is('financially_completed_at', null);
      // Oldest outstanding balance first for collections queue
      query = query.order('completed_at', { ascending: true, nullsLast: true });
    }

    // ── Default sort: newest completion first ──────────────────────────────
    if (paymentStatus !== 'balance_due') {
      query = query.order('completed_at', { ascending: false, nullsLast: true });
    }

    // ── Pagination ─────────────────────────────────────────────────────────
    query = query.range(offset, offset + PER_PAGE - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error('get-admin-completed-bookings error:', error);
      return errorResponse('Failed to load completed bookings', 500);
    }

    const bookings = (data || []).map(mapBooking);
    const total = count ?? 0;

    return jsonResponse({
      data: bookings,
      total,
      page,
      perPage: PER_PAGE,
      totalPages: Math.ceil(total / PER_PAGE),
    });

  } catch (e) {
    console.error('get-admin-completed-bookings error:', e);
    return errorResponse('Server error', 500);
  }
}

function mapBooking(b) {
  const completion = Array.isArray(b.booking_completions)
    ? b.booking_completions[0] ?? null
    : b.booking_completions ?? null;
  const photos = Array.isArray(b.booking_photos) ? b.booking_photos : [];

  return {
    id: b.id,
    bookingRef: `RES-${b.id.slice(0, 8).toUpperCase()}`,
    customerName: b.customer_name || null,
    customerPhone: b.customer_phone || null,
    customerEmail: b.customer_email || null,
    fullAddress: b.full_address || null,
    approvedQuote: b.approved_quote ? Number(b.approved_quote) : null,
    completedAt: b.completed_at || null,
    depositConfirmedAt: b.deposit_confirmed_at || null,
    financiallyCompletedAt: b.financially_completed_at || null,
    stripeInvoiceId: b.stripe_invoice_id || null,
    createdAt: b.created_at || null,
    // From booking_completions
    technicianName: completion?.technician_name || null,
    finalAmountCents: completion?.final_amount_cents || null,
    // Photo counts
    beforePhotoCount: photos.filter(p => p.kind === 'before').length,
    afterPhotoCount: photos.filter(p => p.kind === 'after').length,
  };
}

export const config = { path: '/api/get-admin-completed-bookings' };
