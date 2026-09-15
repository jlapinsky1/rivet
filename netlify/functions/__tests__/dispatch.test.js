/**
 * Dispatch function regression tests.
 *
 * Tests are organised by the 22 regression criteria in the plan.
 * All Supabase + Stripe calls are mocked in-process.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Request helpers ──────────────────────────────────────────────────────────

function makeGet(path) {
  return {
    method: 'GET',
    url: `http://localhost${path}`,
    headers: new Headers({ 'x-nf-client-connection-ip': '1.2.3.4' }),
    json: () => Promise.reject(new Error('GET has no body')),
  };
}

function makePost(body) {
  return {
    method: 'POST',
    url:    'http://localhost/api/dispatch',
    headers: new Headers({ 'content-type': 'application/json', 'x-nf-client-connection-ip': '1.2.3.4' }),
    json: () => Promise.resolve(body),
  };
}

async function parse(res) {
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) };
}

// ── Mock Supabase builder ────────────────────────────────────────────────────

function createMockSupabase(seed = {}) {
  const db = {
    bookings:            [],
    booking_photos:      [],
    booking_completions: [],
    payment_access_tokens: [],
    job_issues:          [],
    notification_events: [],
    audit_log:           [],
    ...seed,
  };

  function makeStorage(storagePath) {
    const { data: inner } = makeQuery('storage_internal');
    return {
      from: () => ({
        createSignedUrl: (_path, _expiry) => Promise.resolve({
          data: { signedUrl: `https://signed.example.com/token-${Math.random().toString(36).slice(2)}` },
          error: null,
        }),
        createSignedUploadUrl: (path) => Promise.resolve({
          data: { signedUrl: `https://upload.example.com/${path}`, path },
          error: null,
        }),
      }),
    };
  }

  function makeQuery(tableName) {
    let filters = [];
    let mode = 'select';
    let insertData = null;
    let updateData = null;
    let isHead = false;
    let isCount = false;

    const chain = {
      select(fields, opts) {
        if (opts?.count === 'exact' && opts?.head) { isHead = true; isCount = true; }
        if (opts?.count === 'exact') isCount = true;
        return chain;
      },
      insert(data) {
        mode = 'insert';
        insertData = Array.isArray(data) ? data : [data];
        return chain;
      },
      update(data) { mode = 'update'; updateData = data; return chain; },
      eq(f, v)   { filters.push(r => r[f] === v); return chain; },
      neq(f, v)  { filters.push(r => r[f] !== v); return chain; },
      in(f, vs)  { filters.push(r => vs.includes(r[f])); return chain; },
      is(f, v)   { filters.push(r => r[f] === v); return chain; },
      not(f, op, v) { return chain; },
      order()    { return chain; },
      limit()    { return chain; },
      single()   { return resolve('single'); },
      maybeSingle() { return resolve('maybeSingle'); },
      then(cb) { return resolve('many').then(cb); },
    };

    function applyFilters(rows) {
      return filters.reduce((acc, f) => acc.filter(f), rows);
    }

    function resolve(returnMode) {
      const table = db[tableName] || [];
      if (isCount) {
        const rows = applyFilters(table);
        const data = isHead ? null : rows;
        return Promise.resolve({ data, count: rows.length, error: null });
      }
      if (mode === 'insert') {
        const rows = insertData.map(d => ({
          id: d.id || `id-${Math.random().toString(36).slice(2)}`,
          created_at: new Date().toISOString(),
          ...d,
        }));
        db[tableName] = [...(db[tableName] || []), ...rows];
        if (returnMode === 'single')      return Promise.resolve({ data: rows[0], error: null });
        if (returnMode === 'maybeSingle') return Promise.resolve({ data: rows[0] ?? null, error: null });
        return Promise.resolve({ data: rows, error: null });
      }
      if (mode === 'update') {
        const rows = applyFilters(table);
        rows.forEach(r => Object.assign(r, updateData));
        if (returnMode === 'single')      return Promise.resolve({ data: rows[0] ?? null, error: null });
        if (returnMode === 'maybeSingle') return Promise.resolve({ data: rows[0] ?? null, error: null });
        return Promise.resolve({ data: rows, error: null });
      }
      const rows = applyFilters(table);
      if (returnMode === 'single') {
        if (rows.length === 0) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        return Promise.resolve({ data: rows[0], error: null });
      }
      if (returnMode === 'maybeSingle') return Promise.resolve({ data: rows[0] ?? null, error: null });
      return Promise.resolve({ data: rows, error: null });
    }

    return chain;
  }

  const client = {
    from: (t) => makeQuery(t),
    storage: makeStorage(),
    _db: db,
  };
  return client;
}

// ── Shared mock wiring ────────────────────────────────────────────────────────

const ADMIN_USER = { id: 'admin-123', email: 'admin@test.com' };

function setupMocks(supabase) {
  vi.doMock('../_shared/supabase.js', () => ({
    verifyAdmin:     vi.fn().mockResolvedValue(ADMIN_USER),
    getServiceClient: vi.fn().mockReturnValue(supabase),
    generateToken:   vi.fn().mockReturnValue('raw-token-abc'),
    sha256:          vi.fn().mockResolvedValue('hashed-token-abc'),
    jsonResponse:    (body, status = 200) => {
      const text = JSON.stringify(body);
      return { status, text: () => Promise.resolve(text), json: () => Promise.resolve(body) };
    },
    errorResponse: (msg, status = 400) => {
      const body = { error: msg };
      const text = JSON.stringify(body);
      return { status, text: () => Promise.resolve(text), json: () => Promise.resolve(body) };
    },
  }));
  vi.doMock('../_shared/stripe.js', () => ({
    getStripeClient: vi.fn(),
    ikey: { finalPI: (id) => `final-pi-${id}` },
    toCents: (dollars) => Math.round(Number(dollars) * 100),
  }));
}

// ── Test suites ────────────────────────────────────────────────────────────

// ── 1–3: dispatch-jobs-today ─────────────────────────────────────────────────

describe('dispatch-jobs-today', () => {
  let handler;
  let supabase;

  const TODAY = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.BUSINESS_TIMEZONE || 'America/New_York',
  }).format(new Date());

  beforeEach(async () => {
    vi.resetModules();
    supabase = createMockSupabase({
      bookings: [
        {
          id: 'b1', status: 'scheduled', preferred_date: TODAY,
          scheduled_pickup: '9:00 AM – 11:00 AM',
          customer_name: 'Alice', customer_phone: '555-0001',
          full_address: '123 Main St, Springfield, IL', deposit_confirmed_at: '2026-07-01T00:00:00Z',
          time_preference: '9:00 AM – 11:00 AM',
          en_route_at: null, arrived_at: null, started_at: null, completed_at: null,
        },
        {
          id: 'b2', status: 'completed', preferred_date: TODAY,
          scheduled_pickup: '1:00 PM – 3:00 PM',
          customer_name: 'Bob', customer_phone: '555-0002',
          full_address: '456 Oak Ave, Springfield, IL', deposit_confirmed_at: '2026-07-01T00:00:00Z',
          time_preference: '1:00 PM – 3:00 PM',
          en_route_at: null, arrived_at: null, started_at: null, completed_at: '2026-07-28T14:00:00Z',
        },
        {
          id: 'b3', status: 'in_progress', preferred_date: TODAY,
          scheduled_pickup: '11:00 AM – 1:00 PM',
          customer_name: 'Carol', customer_phone: '555-0003',
          full_address: '789 Pine Rd, Springfield, IL', deposit_confirmed_at: '2026-07-01T00:00:00Z',
          time_preference: '11:00 AM – 1:00 PM',
          en_route_at: null, arrived_at: null, started_at: '2026-07-28T11:05:00Z', completed_at: null,
        },
      ],
    });
    setupMocks(supabase);
    const mod = await import('../dispatch-jobs-today.js');
    handler = mod.default;
  });

  it('1. returns jobs sorted chronologically by scheduled_pickup', async () => {
    const res = await handler(makeGet('/api/dispatch-jobs-today'));
    const { body } = await parse(res);
    expect(body.jobs.map(j => j.scheduledPickup)).toEqual([
      '9:00 AM – 11:00 AM',
      '11:00 AM – 1:00 PM',
      '1:00 PM – 3:00 PM',
    ]);
  });

  it('2. nextJobId is the first non-completed job', async () => {
    const res = await handler(makeGet('/api/dispatch-jobs-today'));
    const { body } = await parse(res);
    // b1 (9am scheduled) is first non-completed
    expect(body.nextJobId).toBe('b1');
  });

  it('3. empty schedule returns jobs=[] and nextJobId=null', async () => {
    supabase._db.bookings = [];
    const res = await handler(makeGet('/api/dispatch-jobs-today'));
    const { body } = await parse(res);
    expect(body.jobs).toEqual([]);
    expect(body.nextJobId).toBeNull();
  });

  it('22. today date is computed server-side (not from client)', async () => {
    // Handler must not read date from query params as authoritative
    const res = await handler(makeGet('/api/dispatch-jobs-today?date=1990-01-01'));
    const { body } = await parse(res);
    // Should still return today's jobs (server computes the date)
    expect(body.date).toBe(TODAY);
  });
});

// ── 4: dispatch-job ───────────────────────────────────────────────────────────

describe('dispatch-job', () => {
  let handler;
  let supabase;

  beforeEach(async () => {
    vi.resetModules();
    supabase = createMockSupabase({
      bookings: [{
        id: 'b10', status: 'scheduled', preferred_date: '2026-07-28',
        customer_name: 'Diane', customer_phone: '555-1234',
        full_address: '10 Elm St, Chicago, IL 60601',
        access_type: 'garage', quantity: '1 couch',
        description: 'Old green couch from basement',
        internal_notes: 'Ring doorbell twice',
        deposit_confirmed_at: '2026-07-01T00:00:00Z',
        time_preference: '10 AM – 12 PM', scheduled_pickup: '10 AM – 12 PM',
        stairs: 'none', elevator: false,
        en_route_at: null, arrived_at: null, started_at: null, completed_at: null,
      }],
      booking_photos: [
        { id: 'p1', booking_id: 'b10', source: 'customer', kind: 'before', storage_path: 'sessions/abc/photo.jpg', sort_order: 0, file_name: 'photo.jpg' },
      ],
    });
    setupMocks(supabase);
    const mod = await import('../dispatch-job.js');
    handler = mod.default;
  });

  it('4a. returns contact, address, and pickup details', async () => {
    const res = await handler(makeGet('/api/dispatch-job?bookingId=b10'));
    const { body } = await parse(res);
    const job = body.job;
    expect(job.customerName).toBe('Diane');
    expect(job.customerPhone).toBe('555-1234');
    expect(job.fullAddress).toBe('10 Elm St, Chicago, IL 60601');
    expect(job.quantity).toBe('1 couch');
    expect(job.description).toBe('Old green couch from basement');
    expect(job.internalJobNotes).toBe('Ring doorbell twice');
    expect(job.accessType).toBe('garage');
  });

  it('4b. customer photos have signedUrl, never storage_path', async () => {
    const res = await handler(makeGet('/api/dispatch-job?bookingId=b10'));
    const { body } = await parse(res);
    const photo = body.job.customerPhotos[0];
    expect(photo.signedUrl).toBeTruthy();
    expect(photo.signedUrl).toContain('signed.example.com');
    expect(photo.storage_path).toBeUndefined(); // raw path must not be present
  });

  it('9. signed URLs are returned for customer photos, never raw paths', async () => {
    const res = await handler(makeGet('/api/dispatch-job?bookingId=b10'));
    const { body } = await parse(res);
    // Verify no response field contains a raw storage path value
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('sessions/abc/photo.jpg');
  });

  it('19. financial and admin fields are absent from dispatch DTO', async () => {
    const res = await handler(makeGet('/api/dispatch-job?bookingId=b10'));
    const { body } = await parse(res);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('approved_quote');
    expect(raw).not.toContain('stripe_invoice_id');
    expect(raw).not.toContain('stripe_customer_id');
    expect(raw).not.toContain('internal_estimate');
    expect(raw).not.toContain('risk_flags');
  });

  it('21. booking with null scheduled_pickup returns null, not "Invalid Date"', async () => {
    supabase._db.bookings[0].scheduled_pickup = null;
    const res = await handler(makeGet('/api/dispatch-job?bookingId=b10'));
    const { body } = await parse(res);
    expect(body.job.scheduledPickup).toBeNull();
    expect(JSON.stringify(body)).not.toContain('Invalid Date');
  });
});

// ── 5–8: dispatch-status ─────────────────────────────────────────────────────

describe('dispatch-status', () => {
  let handler;
  let supabase;

  function makeBooking(overrides = {}) {
    return {
      id: 'b20', status: 'scheduled',
      deposit_confirmed_at: '2026-07-01T00:00:00Z',
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    supabase = createMockSupabase({ bookings: [makeBooking()] });
    setupMocks(supabase);
    const mod = await import('../dispatch-status.js');
    handler = mod.default;
  });

  it('5. Start Route (scheduled→en_route) blocked without deposit_confirmed_at', async () => {
    supabase._db.bookings = [makeBooking({ deposit_confirmed_at: null })];
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'en_route' }));
    const { status, body } = await parse(res);
    expect(status).toBe(403);
    expect(body.error).toMatch(/deposit not confirmed/i);
  });

  it('6. arrived→in_progress blocked without deposit_confirmed_at', async () => {
    supabase._db.bookings = [makeBooking({ status: 'arrived', deposit_confirmed_at: null })];
    supabase._db.booking_photos = [{ id: 'p1', booking_id: 'b20', source: 'crew', kind: 'before' }];
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'in_progress' }));
    const { status, body } = await parse(res);
    expect(status).toBe(403);
    expect(body.error).toMatch(/deposit not confirmed/i);
  });

  it('7. scheduled→arrived (skipping en_route) returns 422', async () => {
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'arrived' }));
    const { status } = await parse(res);
    expect(status).toBe(422);
  });

  it('8. duplicate status request (already in targetStatus) returns idempotent success', async () => {
    supabase._db.bookings = [makeBooking({ status: 'en_route' })];
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'en_route' }));
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    expect(body.idempotent).toBe(true);
  });

  it('10. arrived→in_progress blocked when no crew before photo exists', async () => {
    supabase._db.bookings = [makeBooking({ status: 'arrived' })];
    supabase._db.booking_photos = []; // no crew before photos
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'in_progress' }));
    const { status, body } = await parse(res);
    expect(status).toBe(422);
    expect(body.error).toMatch(/before photo/i);
  });

  it('arrived→in_progress succeeds with deposit + before photo', async () => {
    supabase._db.bookings = [makeBooking({ status: 'arrived' })];
    supabase._db.booking_photos = [{ id: 'p1', booking_id: 'b20', source: 'crew', kind: 'before' }];
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'in_progress' }));
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('in_progress→completed via this endpoint returns 422 (use dispatch-complete)', async () => {
    supabase._db.bookings = [makeBooking({ status: 'in_progress' })];
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'completed' }));
    const { status } = await parse(res);
    expect(status).toBe(422);
  });

  it('17. notification events are owned by DB trigger, not inserted by function', async () => {
    // The Netlify function must NOT insert into notification_events
    const res = await handler(makePost({ bookingId: 'b20', targetStatus: 'en_route' }));
    await parse(res);
    expect(supabase._db.notification_events).toHaveLength(0);
  });
});

// ── 11–15: dispatch-complete ──────────────────────────────────────────────────

describe('dispatch-complete', () => {
  let handler;
  let supabase;
  let runCompleteJobMock;

  const VALID_BODY = {
    bookingId:       'b30',
    technicianName:  'Jake Smith',
    itemsRemoved:    'Couch, table',
    completionNotes: 'All items removed cleanly',
    completedAt:     '2026-07-28T14:00:00Z',
  };

  function makeBooking(overrides = {}) {
    return {
      id: 'b30', status: 'in_progress',
      deposit_confirmed_at: '2026-07-01T00:00:00Z',
      approved_quote: '250.00',
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    runCompleteJobMock = vi.fn().mockResolvedValue({
      success: true, completionId: 'c1', idempotent: false,
      amountRemainingCents: 12500, finalPaymentLinkSent: true,
    });
    vi.doMock('../_shared/completeJobCore.js', () => ({
      runCompleteJob: (...args) => runCompleteJobMock(...args),
    }));
    supabase = createMockSupabase({
      bookings: [makeBooking()],
      booking_photos: [
        { id: 'p1', booking_id: 'b30', source: 'crew', kind: 'before', storage_path: 'completions/b30/before/x.jpg' },
        { id: 'p2', booking_id: 'b30', source: 'crew', kind: 'after',  storage_path: 'completions/b30/after/y.jpg' },
      ],
    });
    setupMocks(supabase);
    const mod = await import('../dispatch-complete.js');
    handler = mod.default;
  });

  it('11. blocked when no crew before photo exists', async () => {
    supabase._db.booking_photos = supabase._db.booking_photos.filter(p => p.kind !== 'before');
    const res = await handler(makePost(VALID_BODY));
    const { status, body } = await parse(res);
    expect(status).toBe(422);
    expect(body.error).toMatch(/before photo/i);
  });

  it('12. blocked when no crew after photo exists', async () => {
    supabase._db.booking_photos = supabase._db.booking_photos.filter(p => p.kind !== 'after');
    const res = await handler(makePost(VALID_BODY));
    const { status, body } = await parse(res);
    expect(status).toBe(422);
    expect(body.error).toMatch(/after photo/i);
  });

  it('12b. blocked when completionNotes is missing', async () => {
    const res = await handler(makePost({ ...VALID_BODY, completionNotes: '' }));
    const { status } = await parse(res);
    expect(status).toBe(400);
  });

  it('12c. blocked when itemsRemoved is missing', async () => {
    const res = await handler(makePost({ ...VALID_BODY, itemsRemoved: '' }));
    const { status } = await parse(res);
    expect(status).toBe(400);
  });

  it('13. finalAmountCents from client body is ignored - reads from DB approved_quote', async () => {
    const res = await handler(makePost({ ...VALID_BODY, finalAmountCents: 99999 }));
    await parse(res);
    // runCompleteJob should have been called with 25000 (250.00 * 100), not 99999
    expect(runCompleteJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ finalAmountCents: 25000 })
    );
  });

  it('14. calls runCompleteJob (the existing Stripe workflow)', async () => {
    const res = await handler(makePost(VALID_BODY));
    await parse(res);
    expect(runCompleteJobMock).toHaveBeenCalledTimes(1);
  });

  it('15. second call on already-completed booking returns idempotent success', async () => {
    supabase._db.bookings = [makeBooking({ status: 'completed' })];
    runCompleteJobMock.mockResolvedValue({
      success: true, completionId: 'c1', idempotent: true,
      amountRemainingCents: 0, finalPaymentLinkSent: true,
    });
    const res = await handler(makePost(VALID_BODY));
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    expect(body.idempotent).toBe(true);
    // runCompleteJob is called once - it handles idempotency internally
    expect(runCompleteJobMock).toHaveBeenCalledTimes(1);
  });

  it('deposit not confirmed blocks completion from dispatch', async () => {
    supabase._db.bookings = [makeBooking({ deposit_confirmed_at: null })];
    const res = await handler(makePost(VALID_BODY));
    const { status, body } = await parse(res);
    expect(status).toBe(403);
    expect(body.error).toMatch(/deposit not confirmed/i);
  });
});

// ── 16: dispatch-report-issue ─────────────────────────────────────────────────

describe('dispatch-report-issue', () => {
  let handler;
  let supabase;

  beforeEach(async () => {
    vi.resetModules();
    supabase = createMockSupabase({
      bookings: [{ id: 'b40', status: 'arrived' }],
    });
    setupMocks(supabase);
    const mod = await import('../dispatch-report-issue.js');
    handler = mod.default;
  });

  it('16. saves issue to job_issues, creates audit event, does not change status', async () => {
    const res = await handler(makePost({
      bookingId: 'b40',
      issueType: 'customer_unavailable',
      notes:     'No one answered the door',
    }));
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.issueId).toBeTruthy();

    // Issue saved
    expect(supabase._db.job_issues).toHaveLength(1);
    expect(supabase._db.job_issues[0].issue_type).toBe('customer_unavailable');

    // Audit event created
    expect(supabase._db.audit_log).toHaveLength(1);
    expect(supabase._db.audit_log[0].event_type).toBe('issue_reported');

    // Booking status unchanged
    expect(supabase._db.bookings[0].status).toBe('arrived');
  });
});

// ── 17: issue photos use kind='issue' ────────────────────────────────────────

describe('dispatch-photo (issue kind)', () => {
  let handler;
  let supabase;

  beforeEach(async () => {
    vi.resetModules();
    supabase = createMockSupabase({
      bookings: [{ id: 'b50' }],
      job_issues: [{ id: 'issue-1', booking_id: 'b50' }],
    });
    setupMocks(supabase);
    const mod = await import('../dispatch-photo.js');
    handler = mod.default;
  });

  it("17. issue photos saved with kind='issue', not 'before'", async () => {
    const res = await handler(makePost({
      bookingId:   'b50',
      storagePath: 'completions/b50/issue/photo.jpg',
      fileName:    'photo.jpg',
      contentType: 'image/jpeg',
      kind:        'issue',
      jobIssueId:  'issue-1',
    }));
    const { status } = await parse(res);
    expect(status).toBe(200);
    const saved = supabase._db.booking_photos[0];
    expect(saved.kind).toBe('issue');
    expect(saved.source).toBe('crew');
    expect(saved.job_issue_id).toBe('issue-1');
  });
});

// ── 18: completion package excludes kind='issue' photos ──────────────────────

describe('issue photos excluded from completion package', () => {
  it('18. dispatch-complete only passes crew after photos (not issue photos) to runCompleteJob', async () => {
    vi.resetModules();

    const runCompleteJobMock = vi.fn().mockResolvedValue({
      success: true, completionId: 'c9', idempotent: false,
      amountRemainingCents: 0, finalPaymentLinkSent: false,
    });
    vi.doMock('../_shared/completeJobCore.js', () => ({
      runCompleteJob: (...args) => runCompleteJobMock(...args),
    }));

    const supabase = createMockSupabase({
      bookings: [{
        id: 'b60', status: 'in_progress',
        deposit_confirmed_at: '2026-07-01T00:00:00Z',
        approved_quote: '100.00',
      }],
      booking_photos: [
        { id: 'p1', booking_id: 'b60', source: 'crew', kind: 'before', storage_path: 'completions/b60/before/a.jpg' },
        { id: 'p2', booking_id: 'b60', source: 'crew', kind: 'after',  storage_path: 'completions/b60/after/b.jpg' },
        { id: 'p3', booking_id: 'b60', source: 'crew', kind: 'issue',  storage_path: 'completions/b60/issue/c.jpg' },
      ],
    });
    setupMocks(supabase);
    const { default: handler } = await import('../dispatch-complete.js');

    await handler(makePost({
      bookingId: 'b60',
      technicianName: 'Test Tech',
      itemsRemoved: 'Boxes',
      completionNotes: 'Done',
      completedAt: '2026-07-28T14:00:00Z',
    }));

    const { afterPhotoStoragePaths } = runCompleteJobMock.mock.calls[0][0];
    expect(afterPhotoStoragePaths).toHaveLength(1);
    expect(afterPhotoStoragePaths[0]).toBe('completions/b60/after/b.jpg');
    // Issue photo must not be included
    expect(afterPhotoStoragePaths).not.toContain('completions/b60/issue/c.jpg');
  });
});

// ── 19: no internal fields in dispatch responses ──────────────────────────────
// Covered above in dispatch-job test block.

// ── 20: path injection guard ──────────────────────────────────────────────────

describe('dispatch-photo path injection guard', () => {
  let handler;
  let supabase;

  beforeEach(async () => {
    vi.resetModules();
    supabase = createMockSupabase({ bookings: [{ id: 'b70' }] });
    setupMocks(supabase);
    const mod = await import('../dispatch-photo.js');
    handler = mod.default;
  });

  it('rejects storage path outside completions/{bookingId}/', async () => {
    const res = await handler(makePost({
      bookingId:   'b70',
      storagePath: 'sessions/other/photo.jpg', // wrong prefix
      kind:        'before',
    }));
    const { status } = await parse(res);
    expect(status).toBe(422);
  });
});
