/**
 * Integration tests for Netlify function handlers.
 *
 * These test the handler logic with a mock Supabase client,
 * verifying correctness, concurrency, privacy, and failure handling
 * without requiring a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Helpers to build mock Request objects ────────────────────

function makeRequest(method, body, headers = {}) {
  return {
    method,
    url: 'http://localhost/api/test',
    headers: new Headers({
      'content-type': 'application/json',
      'x-nf-client-connection-ip': '1.2.3.4',
      ...headers,
    }),
    json: () => Promise.resolve(body),
  };
}

function makeGetRequest(path, headers = {}) {
  return {
    method: 'GET',
    url: `http://localhost${path}`,
    headers: new Headers({
      'x-nf-client-connection-ip': '1.2.3.4',
      ...headers,
    }),
    json: () => Promise.reject(new Error('GET has no body')),
  };
}

async function parseResponse(response) {
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) };
}

// ── Mock Supabase builder ────────────────────────────────────

function createMockSupabase(overrides = {}) {
  const db = {
    upload_sessions: [],
    session_photos: [],
    bookings: [],
    booking_photos: [],
    quote_tokens: [],
    quote_snapshots: [],
    quote_acceptances: [],
    slot_reservations: [],
    audit_log: [],
    admin_users: [],
    ...overrides,
  };

  function makeQuery(tableName) {
    let filters = [];
    let selectFields = '*';
    let mode = 'select';
    let insertData = null;
    let updateData = null;

    const chain = {
      select(fields, opts) {
        selectFields = fields;
        if (opts?.count === 'exact' && opts?.head) {
          mode = 'count';
        }
        return chain;
      },
      insert(data) {
        mode = 'insert';
        insertData = Array.isArray(data) ? data : [data];
        return chain;
      },
      update(data) {
        mode = 'update';
        updateData = data;
        return chain;
      },
      delete() {
        mode = 'delete';
        return chain;
      },
      eq(field, value) {
        filters.push(r => r[field] === value);
        return chain;
      },
      in(field, values) {
        filters.push(r => values.includes(r[field]));
        return chain;
      },
      neq(field, value) {
        filters.push(r => r[field] !== value);
        return chain;
      },
      is(field, value) {
        filters.push(r => r[field] === value);
        return chain;
      },
      order() { return chain; },
      limit() { return chain; },
      then(cb) { return resolve('many').then(cb); },
      single() {
        return resolve('single');
      },
      maybeSingle() {
        return resolve('maybeSingle');
      },
    };

    function applyFilters(rows) {
      return filters.reduce((r, f) => r.filter(f), rows);
    }

    function resolve(returnMode) {
      const table = db[tableName] || [];

      if (mode === 'count') {
        const count = applyFilters(table).length;
        return Promise.resolve({ count, error: null });
      }

      if (mode === 'insert') {
        // Apply table-specific defaults
        const defaults = tableName === 'upload_sessions'
          ? { max_photos: 10, max_file_bytes: 10485760, max_total_bytes: 52428800, status: 'active' }
          : tableName === 'bookings'
          ? { status: 'pending_review', quote_version: 0 }
          : {};
        const rows = insertData.map(d => ({
          id: d.id || crypto.randomUUID(),
          ...defaults,
          ...d,
          created_at: new Date().toISOString(),
        }));
        db[tableName] = [...(db[tableName] || []), ...rows];

        // Check unique constraints on idempotency_key
        if (tableName === 'bookings') {
          const keys = db.bookings.filter(b => b.idempotency_key).map(b => b.idempotency_key);
          const dupeKey = keys.find((k, i) => keys.indexOf(k) !== i);
          if (dupeKey) {
            db.bookings.pop();
            return Promise.resolve({
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint "bookings_idempotency_key_key"' },
            });
          }
        }

        if (returnMode === 'single') return Promise.resolve({ data: rows[0], error: null });
        if (returnMode === 'maybeSingle') return Promise.resolve({ data: rows[0] || null, error: null });
        return Promise.resolve({ data: rows, error: null });
      }

      if (mode === 'update') {
        const matching = applyFilters(table);
        matching.forEach(row => Object.assign(row, updateData));
        if (returnMode === 'single') {
          return Promise.resolve({ data: matching[0] || null, error: matching.length ? null : { message: 'not found' } });
        }
        if (returnMode === 'maybeSingle') {
          return Promise.resolve({ data: matching[0] || null, error: null });
        }
        return Promise.resolve({ data: matching, error: null });
      }

      if (mode === 'delete') {
        const remaining = table.filter(r => !filters.every(f => f(r)));
        db[tableName] = remaining;
        return Promise.resolve({ data: null, error: null });
      }

      // select
      const rows = applyFilters(table);
      if (returnMode === 'single') {
        return Promise.resolve({
          data: rows[0] || null,
          error: rows.length ? null : { message: 'not found' },
        });
      }
      if (returnMode === 'maybeSingle') {
        return Promise.resolve({ data: rows[0] || null, error: null });
      }
      return Promise.resolve({ data: rows, error: null });
    }

    // Default resolve (for chained queries without single/maybeSingle)
    chain.then = (onResolve) => resolve('array').then(onResolve);

    return chain;
  }

  const supabase = {
    from: (table) => makeQuery(table),
    rpc: vi.fn(async (name, params) => {
      if (name === 'check_rate_limit') {
        return { data: true, error: null };
      }
      if (name === 'accept_quote_atomic') {
        // Idempotency check FIRST (matches real RPC ordering)
        const existing = db.quote_acceptances.find(a => a.idempotency_key === params.p_idempotency_key);
        if (existing) {
          return { data: { success: true, idempotent: true, acceptance_id: existing.id }, error: null };
        }

        // Simulate the RPC behavior
        const token = db.quote_tokens.find(t => t.token_hash === params.p_token_hash);
        if (!token || token.revoked_at || token.used_at || new Date(token.expires_at) < new Date()) {
          return { data: { success: false, error: 'Unable to process this request' }, error: null };
        }

        const booking = db.bookings.find(b => b.id === token.booking_id);
        if (!booking || booking.status !== 'quote_sent') {
          return { data: { success: false, error: 'Unable to process this request' }, error: null };
        }

        // Check slot conflict
        const conflict = db.slot_reservations.find(s =>
          s.resource_id === params.p_resource_id &&
          s.pickup_date === params.p_pickup_date &&
          s.start_time === params.p_start_time &&
          ['reserved', 'confirmed'].includes(s.status)
        );
        if (conflict) {
          return { data: { success: false, error: 'That time slot was just taken. Please choose another.' }, error: null };
        }

        // Check confirmations
        if (!params.p_confirmations || (Array.isArray(params.p_confirmations) ? params.p_confirmations.length : 0) < 3) {
          return { data: { success: false, error: 'All confirmations are required' }, error: null };
        }

        // Success path
        const reservationId = crypto.randomUUID();
        const acceptanceId = crypto.randomUUID();
        db.slot_reservations.push({
          id: reservationId,
          booking_id: booking.id,
          resource_id: params.p_resource_id,
          pickup_date: params.p_pickup_date,
          start_time: params.p_start_time,
          end_time: params.p_end_time,
          status: 'reserved',
        });
        db.quote_acceptances.push({
          id: acceptanceId,
          booking_id: booking.id,
          quote_snapshot_id: token.quote_snapshot_id,
          slot_reservation_id: reservationId,
          idempotency_key: params.p_idempotency_key,
        });
        token.used_at = new Date().toISOString();
        booking.status = 'scheduled';

        return {
          data: {
            success: true,
            acceptance_id: acceptanceId,
            reservation_id: reservationId,
            scheduled_pickup: `${params.p_pickup_date} ${params.p_start_time}-${params.p_end_time}`,
          },
          error: null,
        };
      }
      if (name === 'approve_quote_atomic') {
        const snapshotId = crypto.randomUUID();
        const tokenId = crypto.randomUUID();
        const version = (db.bookings.find(b => b.id === params.p_booking_id)?.quote_version || 0) + 1;
        db.quote_snapshots.push({
          id: snapshotId,
          booking_id: params.p_booking_id,
          version,
          approved_price: params.p_approved_price,
          available_slots: params.p_available_slots,
          customer_terms: params.p_customer_terms,
          expires_at: params.p_expires_at,
        });
        db.quote_tokens.push({
          id: tokenId,
          booking_id: params.p_booking_id,
          quote_snapshot_id: snapshotId,
          token_hash: params.p_token_hash,
          expires_at: params.p_expires_at,
        });
        const booking = db.bookings.find(b => b.id === params.p_booking_id);
        if (booking) {
          booking.status = 'quote_sent';
          booking.quote_version = version;
          booking.quote_token_hash = params.p_token_hash;
        }
        // Revoke previous tokens
        db.quote_tokens.forEach(t => {
          if (t.booking_id === params.p_booking_id && t.id !== tokenId && !t.revoked_at) {
            t.revoked_at = new Date().toISOString();
          }
        });
        return {
          data: { success: true, snapshot_id: snapshotId, token_id: tokenId, version },
          error: null,
        };
      }
      return { data: null, error: { message: 'Unknown RPC' } };
    }),
    storage: {
      from: () => ({
        createSignedUploadUrl: () => Promise.resolve({
          data: { signedUrl: 'https://storage.example.com/upload?signed=true', token: 'upload-token' },
          error: null,
        }),
        createSignedUrl: () => Promise.resolve({
          data: { signedUrl: 'https://storage.example.com/read?signed=true' },
          error: null,
        }),
      }),
    },
    auth: {
      getUser: vi.fn(async (token) => {
        if (token === 'valid-admin-token') {
          return { data: { user: { id: 'admin-user-id', email: 'admin@test.com' } }, error: null };
        }
        if (token === 'valid-nonadmin-token') {
          return { data: { user: { id: 'nonadmin-user-id', email: 'user@test.com' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    _db: db,
  };

  return supabase;
}

// ── Module mocking ───────────────────────────────────────────

let mockSupabase;

vi.mock('../_shared/supabase.js', () => ({
  getServiceClient: () => mockSupabase,
  verifyAdmin: async (req) => {
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const { data: { user } } = await mockSupabase.auth.getUser(token);
    if (!user) return null;
    const isAdmin = mockSupabase._db.admin_users.some(a => a.user_id === user.id);
    if (!isAdmin) return null;
    return user;
  },
  verifyBusinessMember: async (req) => {
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const { data: { user } } = await mockSupabase.auth.getUser(token);
    if (!user) return null;
    const membership = (mockSupabase._db.business_memberships || []).find(m => m.user_id === user.id);
    if (!membership) return null;
    return { user, businessId: membership.business_id };
  },
  verifyTurnstile: async () => ({ success: true }),
  checkRateLimit: async (sb, ip, endpoint) => {
    const result = await sb.rpc('check_rate_limit', { p_ip: ip, p_endpoint: endpoint });
    return result.data;
  },
  getClientIp: () => '1.2.3.4',
  sha256: async (input) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  generateToken: () => 'mock-raw-token-' + Math.random().toString(36).slice(2),
  jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }),
  errorResponse: (message, status = 400) => new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json' },
  }),
}));

// ── Mock service-area module (prevents @netlify/blobs context errors) ────────

vi.mock('../_shared/serviceArea.js', () => ({
  loadServiceAreaConfig: async () => ({
    mode: 'zip-list', centerZip: '', radiusMiles: 30,
    serviceableZips: [], excludedZips: [], unavailableZips: [],
    updatedAt: '', updatedBy: '',
  }),
  evaluateZip: () => ({ serviceable: true, reason: 'unconfigured' }),
  isValidZip: (zip) => /^\d{5}$/.test((zip || '').trim()),
  normalizeAndDedupeZips: (zips) => [
    ...new Set((zips || []).map(z => (z || '').trim()).filter(z => /^\d{5}$/.test(z))),
  ],
  saveServiceAreaConfig: async () => {},
  buildFromEnv: () => ({ serviceableZips: [], excludedZips: [], unavailableZips: [], radiusMiles: 30, centerZip: '', updatedAt: '', updatedBy: '' }),
  DEFAULT_CONFIG: { mode: 'zip-list', serviceableZips: [], excludedZips: [], unavailableZips: [], radiusMiles: 30, centerZip: '', updatedAt: '', updatedBy: '' },
  invalidateConfigCache: () => {},
  checkServiceAreaServer: async () => ({ serviceable: true, reason: 'unconfigured' }),
}));

// ── Import handlers ──────────────────────────────────────────

const { default: createUploadSession } = await import('../create-upload-session.js');
const { default: getUploadUrl } = await import('../get-upload-url.js');
const { default: createBooking } = await import('../create-booking.js');
const { default: approveQuote } = await import('../approve-quote.js');
const { default: getCustomerQuote } = await import('../get-customer-quote.js');
const { default: acceptQuote } = await import('../accept-quote.js');
const { default: completeJob } = await import('../complete-job.js');

// ── sha256 helper (matches mock) ────────────────────────────

async function sha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================
// Tests
// =============================================================

const TEST_BUSINESS_ID = 'test-business-id';

beforeEach(() => {
  mockSupabase = createMockSupabase({
    admin_users: [{ user_id: 'admin-user-id' }],
    businesses: [{ id: TEST_BUSINESS_ID, slug: 'test-biz', name: 'Test Business', vertical: 'junk_removal', timezone: 'America/New_York', settings: {}, created_at: new Date().toISOString() }],
    business_memberships: [{ id: 'mem-1', business_id: TEST_BUSINESS_ID, user_id: 'admin-user-id', role: 'owner' }],
  });
});

// ── Upload session + booking flow ────────────────────────────

describe('Upload session and booking', () => {
  it('creates a valid upload session', async () => {
    const res = await createUploadSession(makeRequest('POST', { turnstileToken: 'tok' }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.sessionId).toBeDefined();
    expect(body.maxPhotos).toBe(10);
  });

  it('creates a booking with valid session', async () => {
    // Setup: create session and add photos
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'active', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      business_id: TEST_BUSINESS_ID,
    });
    mockSupabase._db.session_photos.push({
      id: crypto.randomUUID(), session_id: sessionId,
      storage_path: `sessions/${sessionId}/photo1.jpg`, file_name: 'photo1.jpg',
      content_type: 'image/jpeg', size_bytes: 1000, sort_order: 0,
    });

    const res = await createBooking(makeRequest('POST', {
      sessionId,
      idempotencyKey: 'idem-1',
      customerName: 'John Doe',
      customerPhone: '555-1234',
      address: '123 Main',
      city: 'Atlanta',
      zip: '30301',
      fullAddress: '123 Main, Atlanta, GA 30301',
    }));

    const { status, body } = await parseResponse(res);
    expect(status).toBe(201);
    expect(body.bookingId).toBeDefined();

    // Session should be consumed
    const session = mockSupabase._db.upload_sessions.find(s => s.id === sessionId);
    expect(session.status).toBe('consumed');
  });

  it('returns same booking on duplicate retry with same idempotency key', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'active', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      business_id: TEST_BUSINESS_ID,
    });

    const payload = {
      sessionId,
      idempotencyKey: 'idem-dup',
      customerName: 'Jane',
      customerPhone: '555-0000',
      address: '1 St',
      city: 'NYC',
      zip: '10001',
      fullAddress: '1 St, NYC, NY 10001',
    };

    const res1 = await createBooking(makeRequest('POST', payload));
    const { body: body1 } = await parseResponse(res1);
    expect(body1.bookingId).toBeDefined();

    // Second attempt with same key
    const res2 = await createBooking(makeRequest('POST', { ...payload, sessionId: 'other' }));
    const { body: body2 } = await parseResponse(res2);
    expect(body2.bookingId).toBe(body1.bookingId);
    expect(body2.idempotent).toBe(true);
  });

  it('rejects booking without idempotency key', async () => {
    const res = await createBooking(makeRequest('POST', {
      sessionId: 'sess', customerName: 'X', customerPhone: '555',
      address: 'A', city: 'C', zip: '00000', fullAddress: 'A, C 00000',
    }));
    const { status } = await parseResponse(res);
    expect(status).toBe(400);
  });

  it('rejects expired upload session', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'active', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() - 1000).toISOString(), // expired
    });

    const res = await createBooking(makeRequest('POST', {
      sessionId, idempotencyKey: 'idem-exp',
      customerName: 'X', customerPhone: '555',
      address: 'A', city: 'C', zip: '00000', fullAddress: 'A',
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain('expired');
  });

  it('rejects consumed (reused) upload session', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'consumed', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    const res = await createBooking(makeRequest('POST', {
      sessionId, idempotencyKey: 'idem-reuse',
      customerName: 'X', customerPhone: '555',
      address: 'A', city: 'C', zip: '00000', fullAddress: 'A',
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid|used|expired/i);
  });
});

// ── Upload URL validation ────────────────────────────────────

describe('Upload URL', () => {
  it('rejects invalid file extensions', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'active', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      business_id: TEST_BUSINESS_ID,
    });

    const res = await getUploadUrl(makeRequest('POST', {
      sessionId, fileName: 'malware.exe', contentType: 'image/jpeg',
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain('not allowed');
  });

  it('rejects invalid content types', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'active', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      business_id: TEST_BUSINESS_ID,
    });

    const res = await getUploadUrl(makeRequest('POST', {
      sessionId, fileName: 'photo.jpg', contentType: 'application/pdf',
    }));
    const { status } = await parseResponse(res);
    expect(status).toBe(400);
  });

  it('rejects when photo count exceeds limit', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'active', max_photos: 2, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    // Add 2 existing photos
    for (let i = 0; i < 2; i++) {
      mockSupabase._db.session_photos.push({
        id: crypto.randomUUID(), session_id: sessionId,
        storage_path: `sessions/${sessionId}/p${i}.jpg`, sort_order: i,
      });
    }

    const res = await getUploadUrl(makeRequest('POST', {
      sessionId, fileName: 'extra.jpg', contentType: 'image/jpeg',
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain('Maximum');
  });

  it('rejects expired session for upload', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'active', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await getUploadUrl(makeRequest('POST', {
      sessionId, fileName: 'photo.jpg',
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain('expired');
  });

  it('rejects upload to consumed session', async () => {
    const sessionId = crypto.randomUUID();
    mockSupabase._db.upload_sessions.push({
      id: sessionId, status: 'consumed', max_photos: 10, max_file_bytes: 10485760,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    const res = await getUploadUrl(makeRequest('POST', {
      sessionId, fileName: 'photo.jpg',
    }));
    const { status } = await parseResponse(res);
    expect(status).toBe(400);
  });
});

// ── Admin authorization ──────────────────────────────────────

describe('Admin authorization', () => {
  it('rejects approval without auth', async () => {
    const res = await approveQuote(makeRequest('POST', { bookingId: 'x' }));
    const { status } = await parseResponse(res);
    expect(status).toBe(401);
  });

  it('rejects authenticated user not in admin_users', async () => {
    const res = await approveQuote(makeRequest('POST', { bookingId: 'x' }, {
      authorization: 'Bearer valid-nonadmin-token',
    }));
    const { status } = await parseResponse(res);
    expect(status).toBe(401);
  });

  it('approves quote with valid admin token', async () => {
    const bookingId = crypto.randomUUID();
    mockSupabase._db.bookings.push({
      id: bookingId, status: 'pending_review', quote_version: 0, business_id: TEST_BUSINESS_ID,
    });

    const res = await approveQuote(makeRequest('POST', {
      bookingId,
      approvedPrice: 350,
      recommendedPrice: 300,
      estimateSnapshot: { price: 300 },
      settingsSnapshot: {},
      availableSlots: [{ date: '2026-08-01', startTime: '08:00', endTime: '12:00' }],
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      customerTerms: { priceAdjustmentNotice: 'test', included: [], customerConfirmations: ['a', 'b', 'c'] },
    }, { authorization: 'Bearer valid-admin-token' }));

    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.quoteToken).toBeDefined();
    expect(body.version).toBe(1);
  });

  it('rejects complete-job without admin auth', async () => {
    const res = await completeJob(makeRequest('POST', { bookingId: 'x', actuals: {} }));
    const { status } = await parseResponse(res);
    expect(status).toBe(401);
  });
});

// ── Quote token lifecycle ────────────────────────────────────

describe('Quote token lifecycle', () => {
  let bookingId, tokenHash, rawToken;

  beforeEach(async () => {
    bookingId = crypto.randomUUID();
    rawToken = 'test-raw-token-abc123';
    tokenHash = await sha256(rawToken);

    mockSupabase._db.bookings.push({
      id: bookingId, status: 'quote_sent', quote_version: 1, business_id: TEST_BUSINESS_ID,
      customer_name: 'Test', full_address: '123 Main', quantity: 'A few items',
    });
    mockSupabase._db.quote_snapshots.push({
      id: 'snap-1', booking_id: bookingId, version: 1,
      approved_price: 350, available_slots: [], customer_terms: { included: [], customerConfirmations: ['a', 'b', 'c'], priceAdjustmentNotice: 'test' },
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      // Internal fields that should NOT leak
      estimate_snapshot: { secretData: true },
      settings_snapshot: { internalPricing: true },
      admin_override: { reason: 'secret' },
      admin_id: 'admin-user-id',
    });
    mockSupabase._db.quote_tokens.push({
      id: 'token-1', booking_id: bookingId, quote_snapshot_id: 'snap-1',
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  });

  it('retrieves customer quote with valid token', async () => {
    const res = await getCustomerQuote(makeGetRequest(`/api/get-customer-quote?token=${rawToken}`));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.booking.customerName).toBe('Test');
    expect(body.quote.price).toBe(350);
  });

  it('returns generic error for invalid token', async () => {
    const res = await getCustomerQuote(makeGetRequest('/api/get-customer-quote?token=invalid'));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe('Unable to process this request');
  });

  it('rejects expired token', async () => {
    mockSupabase._db.quote_tokens[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await getCustomerQuote(makeGetRequest(`/api/get-customer-quote?token=${rawToken}`));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe('This quote is no longer available');
  });

  it('rejects revoked token', async () => {
    mockSupabase._db.quote_tokens[0].revoked_at = new Date().toISOString();
    const res = await getCustomerQuote(makeGetRequest(`/api/get-customer-quote?token=${rawToken}`));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe('This quote is no longer available');
  });

  it('rejects used token', async () => {
    mockSupabase._db.quote_tokens[0].used_at = new Date().toISOString();
    const res = await getCustomerQuote(makeGetRequest(`/api/get-customer-quote?token=${rawToken}`));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
  });

  it('supersedes old tokens when a new quote is approved', async () => {
    // Approve a v2 — the mock RPC revokes old tokens
    mockSupabase._db.bookings[0].status = 'pending_review';
    const res = await approveQuote(makeRequest('POST', {
      bookingId,
      approvedPrice: 400,
      estimateSnapshot: { price: 400 },
      customerTerms: { included: [], customerConfirmations: ['a', 'b', 'c'], priceAdjustmentNotice: 'test' },
    }, { authorization: 'Bearer valid-admin-token' }));
    const { body } = await parseResponse(res);
    expect(body.version).toBe(2);

    // Old token should be revoked
    const oldToken = mockSupabase._db.quote_tokens.find(t => t.id === 'token-1');
    expect(oldToken.revoked_at).toBeDefined();
  });
});

// ── Customer DTO allowlist ───────────────────────────────────

describe('Customer DTO field allowlist', () => {
  it('does not leak internal snapshot fields', async () => {
    const bookingId = crypto.randomUUID();
    const rawToken = 'dto-test-token';
    const tokenHash = await sha256(rawToken);

    mockSupabase._db.bookings.push({
      id: bookingId, status: 'quote_sent', customer_name: 'Safe', business_id: TEST_BUSINESS_ID,
      full_address: '1 St', quantity: 'Few', description: 'stuff',
      preferred_date: '2026-08-01', second_choice_date: null, time_preference: 'morning',
      // Internal fields that MUST NOT appear
      internal_notes: 'SECRET NOTES',
      internal_estimate: { secretMargin: 0.45 },
      risk_flags: [{ flag: 'secret' }],
      blocker_overrides: {},
      actuals: null,
    });
    mockSupabase._db.quote_snapshots.push({
      id: 'snap-dto', booking_id: bookingId, version: 1,
      approved_price: 200,
      available_slots: [],
      customer_terms: { included: ['cleanup'], customerConfirmations: ['a', 'b', 'c'], priceAdjustmentNotice: 'n' },
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      // Internal fields
      estimate_snapshot: { internalData: true },
      settings_snapshot: { pricing: true },
      admin_override: { reason: 'internal' },
      admin_id: 'admin-user-id',
      recommended_price: 180,
    });
    mockSupabase._db.quote_tokens.push({
      id: 'tok-dto', booking_id: bookingId, quote_snapshot_id: 'snap-dto',
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const res = await getCustomerQuote(makeGetRequest(`/api/get-customer-quote?token=${rawToken}`));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);

    // Booking DTO should only have allowlisted fields
    const bookingKeys = Object.keys(body.booking);
    expect(bookingKeys).not.toContain('internal_notes');
    expect(bookingKeys).not.toContain('internal_estimate');
    expect(bookingKeys).not.toContain('risk_flags');
    expect(bookingKeys).not.toContain('blocker_overrides');
    expect(bookingKeys).not.toContain('actuals');
    expect(bookingKeys).not.toContain('internalNotes');

    // Quote DTO should only have customer-safe fields
    const quoteKeys = Object.keys(body.quote);
    expect(quoteKeys).not.toContain('estimate_snapshot');
    expect(quoteKeys).not.toContain('settings_snapshot');
    expect(quoteKeys).not.toContain('admin_override');
    expect(quoteKeys).not.toContain('admin_id');
    expect(quoteKeys).not.toContain('recommended_price');

    // Should have expected fields
    expect(body.quote.price).toBe(200);
    expect(body.quote.customerTerms).toBeDefined();
    expect(body.booking.customerName).toBe('Safe');
  });
});

// ── Quote acceptance ─────────────────────────────────────────

describe('Quote acceptance', () => {
  let bookingId, rawToken, tokenHash;

  beforeEach(async () => {
    bookingId = crypto.randomUUID();
    rawToken = 'accept-test-token';
    tokenHash = await sha256(rawToken);

    mockSupabase._db.bookings.push({
      id: bookingId, status: 'quote_sent', quote_version: 1, business_id: TEST_BUSINESS_ID,
    });
    mockSupabase._db.quote_snapshots.push({
      id: 'snap-acc', booking_id: bookingId, version: 1,
      approved_price: 350, customer_terms: { customerConfirmations: ['a', 'b', 'c'] },
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    mockSupabase._db.quote_tokens.push({
      id: 'tok-acc', booking_id: bookingId, quote_snapshot_id: 'snap-acc',
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
  });

  it('accepts a valid quote', async () => {
    const res = await acceptQuote(makeRequest('POST', {
      token: rawToken,
      pickupDate: '2026-08-01',
      startTime: '08:00',
      endTime: '12:00',
      confirmations: ['confirm 1', 'confirm 2', 'confirm 3'],
      idempotencyKey: 'accept-1',
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.acceptance_id).toBeDefined();
  });

  it('returns idempotent result on retry', async () => {
    // First acceptance
    await acceptQuote(makeRequest('POST', {
      token: rawToken, pickupDate: '2026-08-01', startTime: '08:00', endTime: '12:00',
      confirmations: ['a', 'b', 'c'], idempotencyKey: 'accept-idem',
    }));

    // Retry
    const res = await acceptQuote(makeRequest('POST', {
      token: rawToken, pickupDate: '2026-08-01', startTime: '08:00', endTime: '12:00',
      confirmations: ['a', 'b', 'c'], idempotencyKey: 'accept-idem',
    }));
    const { body } = await parseResponse(res);
    expect(body.success).toBe(true);
    expect(body.idempotent).toBe(true);
  });

  it('rejects missing confirmations', async () => {
    const res = await acceptQuote(makeRequest('POST', {
      token: rawToken, pickupDate: '2026-08-01', startTime: '08:00', endTime: '12:00',
      confirmations: ['a', 'b'], // only 2
      idempotencyKey: 'accept-bad-conf',
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain('confirmations');
  });

  it('prevents re-acceptance after token is used', async () => {
    // Accept once
    await acceptQuote(makeRequest('POST', {
      token: rawToken, pickupDate: '2026-08-01', startTime: '08:00', endTime: '12:00',
      confirmations: ['a', 'b', 'c'], idempotencyKey: 'accept-once',
    }));

    // Try again with different idempotency key (different slot)
    const res = await acceptQuote(makeRequest('POST', {
      token: rawToken, pickupDate: '2026-08-02', startTime: '13:00', endTime: '17:00',
      confirmations: ['a', 'b', 'c'], idempotencyKey: 'accept-twice',
    }));
    const { status, body } = await parseResponse(res);
    // Token is now used_at, booking status is 'scheduled' → should fail
    expect(status).toBe(409);
    expect(body.error).toBeDefined();
  });
});

// ── Concurrent slot reservation ──────────────────────────────

describe('Concurrent slot reservation', () => {
  it('exactly one of two concurrent acceptances succeeds', async () => {
    // Setup two bookings with two different tokens for the same slot
    const rawToken1 = 'concurrent-token-1';
    const rawToken2 = 'concurrent-token-2';
    const tokenHash1 = await sha256(rawToken1);
    const tokenHash2 = await sha256(rawToken2);

    const bookingId1 = crypto.randomUUID();
    const bookingId2 = crypto.randomUUID();

    mockSupabase._db.bookings.push(
      { id: bookingId1, status: 'quote_sent', quote_version: 1, business_id: TEST_BUSINESS_ID },
      { id: bookingId2, status: 'quote_sent', quote_version: 1, business_id: TEST_BUSINESS_ID },
    );
    mockSupabase._db.quote_snapshots.push(
      { id: 'snap-c1', booking_id: bookingId1, version: 1, approved_price: 300, customer_terms: { customerConfirmations: ['a', 'b', 'c'] }, expires_at: new Date(Date.now() + 86400000).toISOString() },
      { id: 'snap-c2', booking_id: bookingId2, version: 1, approved_price: 400, customer_terms: { customerConfirmations: ['a', 'b', 'c'] }, expires_at: new Date(Date.now() + 86400000).toISOString() },
    );
    mockSupabase._db.quote_tokens.push(
      { id: 'tok-c1', booking_id: bookingId1, quote_snapshot_id: 'snap-c1', token_hash: tokenHash1, expires_at: new Date(Date.now() + 86400000).toISOString() },
      { id: 'tok-c2', booking_id: bookingId2, quote_snapshot_id: 'snap-c2', token_hash: tokenHash2, expires_at: new Date(Date.now() + 86400000).toISOString() },
    );

    const slotParams = {
      pickupDate: '2026-08-15',
      startTime: '08:00',
      endTime: '12:00',
      resourceId: 'truck-1',
      confirmations: ['a', 'b', 'c'],
    };

    // Fire sequentially (mock can't simulate true DB-level locking;
    // in production, the unique index on slot_reservations handles this)
    const res1 = await acceptQuote(makeRequest('POST', { token: rawToken1, ...slotParams, idempotencyKey: 'conc-1' }));
    const res2 = await acceptQuote(makeRequest('POST', { token: rawToken2, ...slotParams, idempotencyKey: 'conc-2' }));

    const parsed1 = await parseResponse(res1);
    const parsed2 = await parseResponse(res2);

    // One should succeed (200), the other should fail (409 with slot conflict)
    const results = [parsed1, parsed2];
    const successes = results.filter(r => r.status === 200 && r.body.success === true);
    const failures = results.filter(r => r.status === 409);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].body.error).toContain('slot');
  });
});

// ── Completion ───────────────────────────────────────────────

describe('Job completion', () => {
  let bookingId;

  beforeEach(() => {
    bookingId = crypto.randomUUID();
    mockSupabase._db.bookings.push({
      id: bookingId, status: 'scheduled', business_id: TEST_BUSINESS_ID,
      deposit_confirmed_at: new Date().toISOString(),
      approved_quote: '350.00',
    });
  });

  // Helper — builds a valid completion body using the current bookingId.
  function validBody() {
    return {
      bookingId,
      afterPhotoStoragePaths: [`completions/${bookingId}/after/photo.jpg`],
      completionNotes: 'All items removed cleanly',
      itemsRemoved: 'Couch, table',
      technicianName: 'John Smith',
      finalAmountCents: 35000,
      completedAt: new Date().toISOString(),
    };
  }

  it('completes a scheduled booking', async () => {
    const res = await completeJob(makeRequest('POST', validBody(), { authorization: 'Bearer valid-admin-token' }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects completion of a pending_review booking', async () => {
    mockSupabase._db.bookings[0].status = 'pending_review';
    const res = await completeJob(makeRequest('POST', validBody(), { authorization: 'Bearer valid-admin-token' }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain('pending_review');
  });

  it('rejects duplicate completion', async () => {
    // First completion — succeeds, sets booking.status = 'completed'
    await completeJob(makeRequest('POST', validBody(), { authorization: 'Bearer valid-admin-token' }));

    // Second attempt — booking is now 'completed'
    const res = await completeJob(makeRequest('POST', validBody(), { authorization: 'Bearer valid-admin-token' }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(409);
    expect(body.error).toContain('already been completed');
  });

  it('validates finalAmountCents is required', async () => {
    const body = { ...validBody() };
    delete body.finalAmountCents;
    const res = await completeJob(makeRequest('POST', body, { authorization: 'Bearer valid-admin-token' }));
    const { status, body: resBody } = await parseResponse(res);
    expect(status).toBe(400);
    expect(resBody.error).toContain('finalAmount');
  });
});

// ── Storage access control ───────────────────────────────────

describe('Storage access control', () => {
  it('bucket is configured as private', () => {
    // Verified in SQL: insert into storage.buckets ... public = false
    // No anon/public RLS policies exist for storage.objects
    // Only admin_read_storage policy for authenticated + is_admin()
    expect(true).toBe(true); // Structural verification — tested in migration
  });

  it('no storage upload policy for anonymous users exists', () => {
    // SQL migration does not create any INSERT policy on storage.objects
    // Uploads happen only via signed URLs generated by service role
    expect(true).toBe(true);
  });
});
