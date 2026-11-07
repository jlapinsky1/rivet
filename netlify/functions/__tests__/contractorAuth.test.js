import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateOtpRequest,
  slugBase,
  allocateSlug,
  issueContractorOtp,
  buildContractorCodeEmail,
  provisionContractorBusiness,
} from '../_shared/contractorAuth.js';

const OTP = '654321';

function adminClient({ existing = false, missing = false, otp = OTP } = {}) {
  const calls = [];
  let userExists = existing;
  const client = {
    calls,
    auth: {
      admin: {
        generateLink: async (args) => {
          calls.push({ method: 'generateLink', args });
          if (args.type === 'magiclink' && (missing || !userExists)) {
            return { data: null, error: { message: 'User with this email not found', status: 404, code: 'user_not_found' } };
          }
          if (args.type === 'invite') userExists = true;
          return {
            data: {
              properties: {
                email_otp: otp,
                verification_type: args.type === 'invite' ? 'invite' : 'magiclink',
                action_link: 'https://example.test/auth/v1/verify?token=secret',
              },
              user: { id: 'user-1' },
            },
            error: null,
          };
        },
      },
    },
  };
  return client;
}

describe('contractor OTP request validation', () => {
  it('requires a business name and contact before sign-up', () => {
    expect(validateOtpRequest({ intent: 'signup', email: 'new@shop.test' }).ok).toBe(false);
    expect(validateOtpRequest({
      intent: 'signup',
      email: 'new@shop.test',
      businessName: 'Northside Handyman',
      contactName: 'Alex',
    })).toMatchObject({
      ok: true,
      intent: 'signup',
      email: 'new@shop.test',
      businessName: 'Northside Handyman',
      contactName: 'Alex',
    });
  });

  it('accepts login with only an email', () => {
    expect(validateOtpRequest({ intent: 'login', email: ' Mason@MyRivet.io ' })).toMatchObject({
      ok: true,
      intent: 'login',
      email: 'mason@myrivet.io',
    });
  });
});

describe('business slug', () => {
  it('builds a url slug from the business name', () => {
    expect(slugBase("José's Handyman")).toBe('jose-s-handyman');
  });

  it('skips a slug that is already taken', async () => {
    const taken = new Set(['northside-handyman']);
    const supabase = {
      from() {
        let slug = '';
        return {
          select() { return this; },
          eq(_col, value) { slug = value; return this; },
          maybeSingle: async () => ({ data: taken.has(slug) ? { id: 'taken' } : null, error: null }),
        };
      },
    };
    await expect(allocateSlug(supabase, 'Northside Handyman')).resolves.toBe('northside-handyman-2');
  });
});

describe('issueContractorOtp', () => {
  it('creates a passwordless user and emails the code without returning it', async () => {
    const supabase = adminClient();
    const sent = [];
    const result = await issueContractorOtp({
      supabase,
      intent: 'signup',
      email: 'new@shop.test',
      sendEmail: async (msg) => { sent.push(msg); },
    });

    expect(supabase.calls.map(call => call.args.type)).toEqual(['magiclink', 'invite', 'magiclink']);
    expect(supabase.calls.some(call => call.method === 'createUser')).toBe(false);
    expect(JSON.stringify(supabase.calls)).not.toContain('password');
    expect(sent).toEqual([{ to: 'new@shop.test', code: OTP }]);
    expect(result).toEqual({
      status: 200,
      body: { sent: true, existingAccount: false, verificationType: 'magiclink' },
    });
    expect(JSON.stringify(result.body)).not.toContain(OTP);
    expect(JSON.stringify(result.body)).not.toContain('action_link');
  });

  it('does not create a user when logging in', async () => {
    const supabase = adminClient({ existing: true });
    await issueContractorOtp({
      supabase,
      intent: 'login',
      email: 'mason@myrivet.io',
      sendEmail: async () => {},
    });
    expect(supabase.calls.map(call => call.method)).toEqual(['generateLink']);
  });

  it('tells a new login email to start free and does not create a user', async () => {
    const supabase = adminClient({ missing: true });
    const sent = [];
    const result = await issueContractorOtp({
      supabase,
      intent: 'login',
      email: 'missing@shop.test',
      sendEmail: async (msg) => { sent.push(msg); },
    });
    expect(result.status).toBe(404);
    expect(result.body.error).toMatch(/Start free/);
    expect(sent).toEqual([]);
    expect(supabase.calls.map(call => call.method)).toEqual(['generateLink']);
  });

  it('sends a sign-in code when the email already has an account', async () => {
    const supabase = adminClient({ existing: true });
    const result = await issueContractorOtp({
      supabase,
      intent: 'signup',
      email: 'mason@myrivet.io',
      sendEmail: async () => {},
    });
    expect(result.body.existingAccount).toBe(true);
    expect(supabase.calls.map(call => call.args.type)).toEqual(['magiclink']);
    expect(JSON.stringify(supabase.calls)).not.toContain('password');
  });
});

describe('sign-in email', () => {
  it('mints a different code on every request', async () => {
    const codes = ['111111', '222222'];
    let n = 0;
    const sent = [];
    const supabase = {
      auth: {
        admin: {
          generateLink: async () => ({
            data: {
              properties: {
                email_otp: codes[n++],
                verification_type: 'magiclink',
                action_link: 'https://example.test/secret',
              },
            },
            error: null,
          }),
        },
      },
    };

    await issueContractorOtp({
      supabase,
      intent: 'login',
      email: 'mason@myrivet.io',
      sendEmail: async (msg) => { sent.push(msg.code); },
    });
    await issueContractorOtp({
      supabase,
      intent: 'login',
      email: 'mason@myrivet.io',
      sendEmail: async (msg) => { sent.push(msg.code); },
    });

    expect(sent).toEqual(['111111', '222222']);
    expect(n).toBe(2);
  });

  it('includes the code and does not include a password or the raw auth link', () => {
    const message = buildContractorCodeEmail({ code: OTP });
    expect(message.subject).toMatch(/code/i);
    expect(message.html).toContain(OTP);
    expect(message.html).not.toContain('password');
    expect(message.html).not.toContain('verify?token');
  });
});

describe('provisionContractorBusiness', () => {
  it('creates a handyman business and owner membership without storing a password', async () => {
    const inserts = [];
    const supabase = {
      from(table) {
        if (table === 'business_memberships') {
          return {
            select() { return this; },
            eq() { return this; },
            limit() { return this; },
            maybeSingle: async () => ({ data: null, error: null }),
            insert(row) {
              inserts.push({ table, row });
              return Promise.resolve({ error: null });
            },
          };
        }
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
          insert(row) {
            inserts.push({ table, row });
            return {
              select() {
                return { single: async () => ({ data: { id: 'biz-1' }, error: null }) };
              },
            };
          },
          delete() { return { eq: async () => ({ error: null }) }; },
        };
      },
      auth: { admin: { updateUserById: async () => ({ error: null }) } },
    };

    const result = await provisionContractorBusiness({
      supabase,
      user: { id: 'user-1', user_metadata: {} },
      businessName: 'Northside Handyman',
      contactName: 'Alex Rivera',
    });

    expect(result).toEqual({ status: 200, body: { businessId: 'biz-1', created: true } });
    expect(inserts).toEqual([
      {
        table: 'businesses',
        row: {
          owner_user_id: 'user-1',
          name: 'Northside Handyman',
          slug: 'northside-handyman',
          vertical: 'handyman',
          timezone: 'America/New_York',
          settings: {},
        },
      },
      {
        table: 'business_memberships',
        row: { business_id: 'biz-1', user_id: 'user-1', role: 'owner' },
      },
    ]);
    expect(JSON.stringify(inserts)).not.toContain('password');
  });

  it('does not create a second business when the contractor already has one', async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          limit() { return this; },
          maybeSingle: async () => ({ data: { business_id: 'existing' }, error: null }),
          insert() { throw new Error('should not insert'); },
        };
      },
    };
    const result = await provisionContractorBusiness({
      supabase,
      user: { id: 'user-1' },
      businessName: 'Another Name',
      contactName: 'Alex',
    });
    expect(result).toEqual({ status: 200, body: { businessId: 'existing', created: false } });
  });
});

describe('contractor OTP endpoint', () => {
  const state = {
    allowed: true,
    createUser: vi.fn(),
    generateLink: vi.fn(),
  };

  beforeEach(() => {
    state.allowed = true;
    state.createUser.mockReset();
    state.generateLink.mockReset();
    state.createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    state.generateLink.mockResolvedValue({
      data: {
        properties: {
          email_otp: OTP,
          verification_type: 'magiclink',
          action_link: 'https://example.test/secret',
        },
      },
      error: null,
    });
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'noreply@myrivet.io';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('refuses to return the one-time code to the browser', async () => {
    vi.resetModules();
    vi.doMock('../_shared/supabase.js', () => ({
      getServiceClient: () => ({
        auth: {
          admin: {
            createUser: state.createUser,
            generateLink: state.generateLink,
          },
        },
      }),
      getClientIp: () => '203.0.113.5',
      checkRateLimit: async () => state.allowed,
      jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
      errorResponse: (message, status = 400) => new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    }));

    const { default: handler } = await import('../contractor-otp.js');
    const response = await handler({
      method: 'POST',
      headers: new Headers(),
      json: async () => ({
        intent: 'signup',
        email: 'new@shop.test',
        businessName: 'Northside Handyman',
        contactName: 'Alex Rivera',
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sent).toBe(true);
    expect(JSON.stringify(body)).not.toContain(OTP);
    expect(JSON.stringify(body)).not.toContain('secret');

    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(fetchBody.html).toContain(OTP);
    expect(fetchBody.to).toEqual(['new@shop.test']);
    expect(state.createUser).not.toHaveBeenCalled();
    expect(state.generateLink).toHaveBeenCalled();
  });

  it('stops before creating a user when the address is rate limited', async () => {
    state.allowed = false;
    vi.resetModules();
    vi.doMock('../_shared/supabase.js', () => ({
      getServiceClient: () => ({
        auth: { admin: { createUser: state.createUser, generateLink: state.generateLink } },
      }),
      getClientIp: () => '203.0.113.5',
      checkRateLimit: async () => state.allowed,
      jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }),
      errorResponse: (message, status = 400) => new Response(JSON.stringify({ error: message }), { status }),
    }));
    const { default: handler } = await import('../contractor-otp.js');
    const response = await handler({
      method: 'POST',
      headers: new Headers(),
      json: async () => ({
        intent: 'signup',
        email: 'new@shop.test',
        businessName: 'Northside Handyman',
        contactName: 'Alex',
      }),
    });
    expect(response.status).toBe(429);
    expect(state.createUser).not.toHaveBeenCalled();
  });
});
