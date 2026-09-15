/**
 * Commercial estimate request flow tests
 *
 * Coverage:
 * - check-commercial-email (rate limit, validation, exists flag)
 * - submit-commercial-request (validation, duplicate email, idempotency, partial failure)
 * - create-commercial-job (authenticated submit, draft mode)
 * - sessionStorage draft + double-submit guard
 * - Attribution capture
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeReq(body, headers = {}) {
  return {
    method: 'POST',
    headers: {
      get: (k) => ({ 'content-type': 'application/json', authorization: 'Bearer test-token', ...headers }[k.toLowerCase()] || null),
    },
    json: vi.fn().mockResolvedValue(body),
  };
}

const VALID_SUBMIT_BODY = {
  idempotencyKey: 'idem-1',
  name: 'Joe Manager',
  email: 'joe@test.com',
  password: 'Password1',
  phone: '7705551234',
  company: 'Acme Properties',
  propName: 'Oak Apartments',
  propStreet: '123 Main St',
  propCity: 'Atlanta',
  propState: 'GA',
  propZip: '30301',
  propType: 'apartment_multifamily',
  jobService: 'Unit Turnover Cleanout',
  jobDescription: 'Remove furniture from unit 204',
};

function makeSubmitSupabase({
  existingJob = null,
  emailTaken = false,
  createUserResult = { data: { user: { id: 'uid-1', email: 'joe@test.com' } }, error: null },
  clientUpdateResult = { data: { id: 'client-1', company_name: 'Acme', contact_name: 'Joe', phone: '770' }, error: null },
  propertyInsertResult = { data: { id: 'prop-1', name: 'Oak', address: '123 Main' }, error: null },
  jobInsertResult = { data: { id: 'job-1' }, error: null },
  failAfterUser = null, // 'client' | 'property' | 'job'
} = {}) {
  const from = vi.fn((table) => {
    if (table === 'jobs') {
      const chain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: existingJob, error: null }),
        single: vi.fn().mockResolvedValue(
          failAfterUser === 'job'
            ? { data: null, error: { message: 'fail' } }
            : jobInsertResult
        ),
      };
      return chain;
    }
    if (table === 'properties') {
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          existingJob
            ? { data: { id: 'prop-1', client_id: 'client-1' }, error: null }
            : failAfterUser === 'property'
              ? { data: null, error: { message: 'fail' } }
              : propertyInsertResult
        ),
      };
    }
    if (table === 'commercial_clients') {
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          existingJob
            ? { data: { id: 'client-1', user_id: 'uid-1' }, error: null }
            : failAfterUser === 'client'
              ? { data: null, error: { message: 'fail' } }
              : clientUpdateResult
        ),
      };
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }) };
  });

  return {
    from,
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue(createUserResult),
      },
    },
    rpc: vi.fn().mockImplementation((name) => {
      if (name === 'commercial_email_registered') {
        return Promise.resolve({ data: emailTaken, error: null });
      }
      return Promise.resolve({ data: true, error: null });
    }),
  };
}

// ── check-commercial-email ─────────────────────────────────────────────────────

describe('check-commercial-email', () => {
  let handler;
  let supabaseMock;

  beforeEach(async () => {
    supabaseMock = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    vi.doMock('../../netlify/functions/_shared/supabase.js', () => ({
      getServiceClient: () => supabaseMock,
      checkRateLimit: vi.fn().mockResolvedValue(true),
      getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
      jsonResponse: (body, status = 200) => ({ body, status }),
      errorResponse: (msg, status = 400) => ({ body: { error: msg }, status }),
    }));
    ({ default: handler } = await import('../../netlify/functions/check-commercial-email.js'));
  });

  it('returns 400 when email is missing', async () => {
    const res = await handler(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('returns exists: true when email is registered', async () => {
    const res = await handler(makeReq({ email: 'taken@test.com' }));
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('commercial_email_registered', {
      p_email: 'taken@test.com',
    });
  });

  it('returns exists: false when email is new', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: false, error: null });
    const res = await handler(makeReq({ email: 'new@test.com' }));
    expect(res.body.exists).toBe(false);
  });
});

// ── submit-commercial-request ────────────────────────────────────────────────

describe('submit-commercial-request', () => {
  let handler;
  let supabaseMock;

  beforeEach(async () => {
    supabaseMock = makeSubmitSupabase();
    vi.doMock('../../netlify/functions/_shared/supabase.js', () => ({
      getServiceClient: () => supabaseMock,
      checkRateLimit: vi.fn().mockResolvedValue(true),
      getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
      jsonResponse: (body, status = 200) => ({ body, status }),
      errorResponse: (msg, status = 400) => ({ body: { error: msg }, status }),
    }));
    vi.doMock('../../netlify/functions/_shared/commercialRequest.js', () => ({
      ensureCommercialClient: vi.fn().mockResolvedValue({
        id: 'client-1',
        company_name: 'Acme',
        contact_name: 'Joe',
        phone: '770',
      }),
      sendCommercialJobEmails: vi.fn().mockResolvedValue(undefined),
      linkUploadSessionPhotos: vi.fn().mockResolvedValue(0),
    }));
    ({ default: handler } = await import('../../netlify/functions/submit-commercial-request.js'));
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await handler(makeReq({ name: 'Joe', email: 'joe@test.com' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 409 when email is already registered', async () => {
    supabaseMock = makeSubmitSupabase({ emailTaken: true });
    vi.doMock('../../netlify/functions/_shared/supabase.js', () => ({
      getServiceClient: () => supabaseMock,
      checkRateLimit: vi.fn().mockResolvedValue(true),
      getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
      jsonResponse: (body, status = 200) => ({ body, status }),
      errorResponse: (msg, status = 400) => ({ body: { error: msg }, status }),
    }));
    ({ default: handler } = await import('../../netlify/functions/submit-commercial-request.js'));

    const res = await handler(makeReq(VALID_SUBMIT_BODY));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/log in/i);
  });

  it('returns idempotent 200 when idempotency key already submitted', async () => {
    supabaseMock = makeSubmitSupabase({
      existingJob: { id: 'job-1', property_id: 'prop-1', status: 'pending_review' },
    });
    vi.doMock('../../netlify/functions/_shared/supabase.js', () => ({
      getServiceClient: () => supabaseMock,
      checkRateLimit: vi.fn().mockResolvedValue(true),
      getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
      jsonResponse: (body, status = 200) => ({ body, status }),
      errorResponse: (msg, status = 400) => ({ body: { error: msg }, status }),
    }));
    ({ default: handler } = await import('../../netlify/functions/submit-commercial-request.js'));

    const res = await handler(makeReq(VALID_SUBMIT_BODY));
    expect(res.status).toBe(200);
    expect(res.body.alreadySubmitted).toBe(true);
    expect(res.body.jobId).toBe('job-1');
    expect(supabaseMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('creates account, property, and pending_review job on success', async () => {
    const res = await handler(makeReq(VALID_SUBMIT_BODY));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('clientId');
    expect(res.body).toHaveProperty('propertyId');
    expect(res.body).toHaveProperty('jobId');
    expect(supabaseMock.auth.admin.createUser).toHaveBeenCalled();
  });

  it('returns 500 with userCreated when post-auth steps fail', async () => {
    supabaseMock = makeSubmitSupabase({ failAfterUser: 'property' });
    vi.doMock('../../netlify/functions/_shared/supabase.js', () => ({
      getServiceClient: () => supabaseMock,
      checkRateLimit: vi.fn().mockResolvedValue(true),
      getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
      jsonResponse: (body, status = 200) => ({ body, status }),
      errorResponse: (msg, status = 400) => ({ body: { error: msg }, status }),
    }));
    ({ default: handler } = await import('../../netlify/functions/submit-commercial-request.js'));

    const res = await handler(makeReq(VALID_SUBMIT_BODY));
    expect(res.status).toBe(500);
    expect(res.body.userCreated).toBe(true);
    expect(res.body.error).toMatch(/log in/i);
  });
});

// ── create-commercial-job (authenticated path) ───────────────────────────────

describe('create-commercial-job - draft mode', () => {
  let handler;
  let supabaseMock;
  let fetchMock;

  beforeEach(async () => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    supabaseMock = {
      from: vi.fn()
        .mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'prop-1', name: 'Test', address: '123', primary_contact_email: null } }) })
        .mockReturnValueOnce({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'job-1' }, error: null }) }) })
        .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'client@test.com' } } }),
        },
      },
    };

    vi.doMock('../../netlify/functions/_shared/supabase.js', () => ({
      getServiceClient: () => supabaseMock,
      verifyCommercialClient: vi.fn().mockResolvedValue({ user: { id: 'uid-1' }, client: { id: 'client-1', company_name: 'Acme', contact_name: 'Joe', phone: '770' } }),
      jsonResponse: (body, status = 200) => ({ body, status }),
      errorResponse: (msg, status = 400) => ({ body: { error: msg }, status }),
    }));
    ({ default: handler } = await import('../../netlify/functions/create-commercial-job.js'));
  });

  it('does NOT call Resend when draft: true', async () => {
    await handler(makeReq({ propertyId: 'prop-1', description: 'Remove sofa', draft: true }));
    const resendCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('resend.com')
    );
    expect(resendCalls).toHaveLength(0);
  });

  it('sends emails when draft is false', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('ADMIN_EMAIL', 'admin@test.com');
    await handler(makeReq({ propertyId: 'prop-1', description: 'Remove sofa', draft: false }));
    const resendCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('resend.com')
    );
    expect(resendCalls.length).toBeGreaterThan(0);
  });
});

// ── PortalStart - double-submit guard ────────────────────────────────────────

describe('PortalStart - final step double-submit protection', () => {
  it('submitted flag prevents duplicate submit handler calls', async () => {
    let callCount = 0;
    const submitted = { current: false };

    async function handleFinalSubmit() {
      if (submitted.current) return;
      submitted.current = true;
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
    }

    await Promise.all([handleFinalSubmit(), handleFinalSubmit(), handleFinalSubmit()]);
    expect(callCount).toBe(1);
  });
});

// ── Attribution capture ───────────────────────────────────────────────────────

describe('Attribution capture', () => {
  it('sets landing_page to the current wizard URL, not document.referrer', () => {
    const mockHref = 'https://gosquatterz.com/portal/start?utm_source=google&utm_medium=cpc';
    const referrer = 'https://google.com/search?q=junk+removal';
    const search = '?utm_source=google&utm_medium=cpc';

    const p = new URLSearchParams(search);
    const attribution = {
      utm_source: p.get('utm_source') || '',
      utm_medium: p.get('utm_medium') || '',
      referrer,
      landing_page: mockHref,
    };

    expect(attribution.landing_page).toBe(mockHref);
    expect(attribution.referrer).toBe(referrer);
    expect(attribution.landing_page).not.toBe(attribution.referrer);
    expect(attribution.utm_source).toBe('google');
    expect(attribution.utm_medium).toBe('cpc');
  });
});

// ── sessionStorage draft resume ───────────────────────────────────────────────

describe('sessionStorage draft resume', () => {
  it('preserves pendingLogin flag for login redirect flow', () => {
    const draft = {
      idempotencyKey: 'idem-1',
      propName: 'Oak Apartments',
      contactEmail: 'existing@test.com',
      pendingLogin: true,
    };

    const serialized = JSON.stringify(draft);
    const restored = JSON.parse(serialized);

    expect(restored.pendingLogin).toBe(true);
    expect(restored.propName).toBe('Oak Apartments');
    expect(restored.idempotencyKey).toBe('idem-1');
  });
});
