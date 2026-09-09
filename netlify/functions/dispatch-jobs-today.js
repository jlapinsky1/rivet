/**
 * GET /api/dispatch-jobs-today
 *
 * Returns today's jobs for the authenticated user's business.
 *
 * Queries two sources:
 *   1. work_items (Rivet estimation pipeline) — scheduled jobs with today's preferred_date
 *   2. bookings (Squatterz dispatch) — scheduled/active bookings for today
 *
 * Both are merged into a unified dispatch DTO so the mobile dispatch view
 * works for any business type.
 */

import { getServiceClient, verifyBusinessMember, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/New_York';

function getLocalDateString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(new Date());
}

/** Map a work_item row into a dispatch DTO. */
function workItemToDTO(w) {
  return {
    id:                 w.id,
    source:             'work_item',
    bookingRef:         null,
    status:             mapOpStatus(w.op_status),
    depositConfirmed:   true,
    appointmentDate:    w.preferred_date ?? null,
    appointmentWindow:  null,
    scheduledPickup:    null,
    customerName:       w.customer_name ?? null,
    customerPhone:      w.phone ?? null,
    fullAddress:        w.address ?? null,
    accessInstructions: null,
    quantity:           null,
    accessType:         null,
    stairs:             null,
    elevator:           null,
    description:        w.description ?? null,
    internalJobNotes:   w.customer_notes ?? null,
    title:              w.title ?? null,
    price:              w.price ?? null,
    hours:              w.hours ?? null,
    travel:             w.travel ?? null,
    enRouteAt:          null,
    arrivedAt:          null,
    startedAt:          null,
    completedAt:        null,
  };
}

/** Map work_item op_status to dispatch-compatible status. */
function mapOpStatus(opStatus) {
  const map = {
    scheduled: 'scheduled',
    in_progress: 'in_progress',
    completed: 'completed',
    approved: 'scheduled',      // approved jobs are ready to dispatch
  };
  return map[opStatus] || 'scheduled';
}

/** Map a bookings row into a dispatch DTO. */
function bookingToDTO(b) {
  return {
    id:                 b.id,
    source:             'booking',
    bookingRef:         'RES-' + b.id.slice(0, 8).toUpperCase(),
    status:             b.status,
    depositConfirmed:   b.deposit_confirmed_at != null,
    appointmentDate:    b.preferred_date ?? null,
    appointmentWindow:  b.time_preference ?? null,
    scheduledPickup:    b.scheduled_pickup ?? null,
    customerName:       b.customer_name ?? null,
    customerPhone:      b.customer_phone ?? null,
    fullAddress:        b.full_address ?? null,
    accessInstructions: b.access_type ?? null,
    quantity:           b.quantity ?? null,
    accessType:         b.access_type ?? null,
    stairs:             b.stairs ?? null,
    elevator:           b.elevator ?? null,
    description:        b.description ?? null,
    internalJobNotes:   b.internal_notes ?? null,
    title:              null,
    price:              null,
    hours:              null,
    travel:             null,
    enRouteAt:          b.en_route_at ?? null,
    arrivedAt:          b.arrived_at ?? null,
    startedAt:          b.started_at ?? null,
    completedAt:        b.completed_at ?? null,
  };
}

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  try {
    // Try business member auth first (Rivet), fall back to admin auth (Squatterz)
    let user, businessId;
    const member = await verifyBusinessMember(req);
    if (member) {
      user = member.user;
      businessId = member.businessId;
    } else {
      const admin = await verifyAdmin(req);
      if (!admin) return errorResponse('Unauthorized', 401);
      user = admin;
      businessId = null; // legacy admin — no business scope
    }

    const todayStr = getLocalDateString();
    const supabase = getServiceClient();
    const jobs = [];

    // 1. Query work_items (Rivet) — scheduled/approved/in_progress for today
    if (businessId) {
      const { data: workItems, error: wiErr } = await supabase
        .from('work_items')
        .select('*')
        .eq('business_id', businessId)
        .in('op_status', ['approved', 'scheduled', 'in_progress', 'completed'])
        .order('created_at', { ascending: true });

      if (!wiErr && workItems) {
        // Filter to today's preferred_date (if set) or include all approved/scheduled
        for (const w of workItems) {
          if (w.preferred_date && w.preferred_date !== todayStr) continue;
          jobs.push(workItemToDTO(w));
        }
      }
    }

    // 2. Query bookings (Squatterz) — only if the table exists
    try {
      const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select(
          'id, status, deposit_confirmed_at, preferred_date, time_preference, ' +
          'scheduled_pickup, customer_name, customer_phone, full_address, ' +
          'access_type, quantity, stairs, elevator, description, internal_notes, ' +
          'en_route_at, arrived_at, started_at, completed_at'
        )
        .in('status', ['scheduled', 'en_route', 'arrived', 'in_progress', 'completed'])
        .eq('preferred_date', todayStr)
        .order('scheduled_pickup', { ascending: true });

      if (!bErr && bookings) {
        for (const b of bookings) {
          jobs.push(bookingToDTO(b));
        }
      }
    } catch {
      // bookings table may not exist for Rivet-only accounts — that's fine
    }

    // Sort: active jobs first, then by appointment time
    const STATUS_ORDER = { in_progress: 0, arrived: 1, en_route: 2, scheduled: 3, completed: 4 };
    jobs.sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3));

    const nextJob = jobs.find(j => j.status !== 'completed');

    return jsonResponse({ jobs, nextJobId: nextJob?.id ?? null, date: todayStr });

  } catch (e) {
    console.error('dispatch-jobs-today error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/dispatch-jobs-today' };
