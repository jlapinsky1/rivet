import {
  getServiceClient,
  checkRateLimit,
  getClientIp,
  jsonResponse,
  errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const supabase = getServiceClient();
    const ip = getClientIp(req);

    const allowed = await checkRateLimit(supabase, ip, 'start-commercial-onboarding', 3600, 5);
    if (!allowed) return errorResponse('Too many requests. Please try again later.', 429);

    const { name, email, password, phone, company, jobTitle, attribution } = await req.json();

    // Validate required fields - do not log values
    if (!name || !email || !password || !phone || !company) {
      return errorResponse('Name, email, password, phone, and company are required.');
    }
    if (password.length < 8) {
      return errorResponse('Password must be at least 8 characters.');
    }

    // Attempt to create the auth user.
    // If the email is already registered, Supabase returns an error with
    // status 422 and message "User already registered".  We surface this
    // as a 409 so the frontend can prompt the user to log in instead.
    // We intentionally do NOT call getUserByEmail() first because that
    // would expose whether an email is in our system to unauthenticated
    // callers and adds a round-trip that createUser() makes redundant.
    const { data: { user }, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // bypass confirmation gate for immediate portal access
      user_metadata: { full_name: name },
    });

    if (createErr) {
      const msg = createErr.message || '';
      if (
        createErr.status === 422 ||
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already exists')
      ) {
        return errorResponse('An account with this email already exists. Please log in.', 409);
      }
      console.error('createUser error (status=%s)', createErr.status);
      return errorResponse(createErr.message || 'Failed to create account.', 400);
    }

    if (!user) {
      return errorResponse('Failed to create account.', 500);
    }

    // Similar company names are flagged internally for manual review only.
    // We never expose any existing client information to the caller.
    const { data: similarOrgs } = await supabase
      .from('commercial_clients')
      .select('id')
      .ilike('company_name', `%${company.substring(0, 20)}%`)
      .neq('user_id', user.id)
      .limit(1);

    if (similarOrgs?.length > 0) {
      // Log for admin awareness - do not include company name in the log
      console.warn('start-commercial-onboarding: similar company name detected, review manually');
    }

    // Wait for the handle_new_client trigger to create the commercial_clients row
    await new Promise((r) => setTimeout(r, 400));

    const { error: updateErr } = await supabase
      .from('commercial_clients')
      .update({
        company_name: company,
        contact_name: name,
        phone,
        job_title: jobTitle || null,
        onboarding_status: 'in_progress',
        last_onboarding_step: 1,
        attribution: attribution || {},
      })
      .eq('user_id', user.id);

    if (updateErr) {
      // Non-fatal - user exists, portal will still work
      console.error('commercial_clients update error (step 1)');
    }

    // Generate a Supabase magic link for abandoned-onboarding recovery.
    // The link is good for the default Supabase OTP lifetime (1 hour by default).
    // No custom token hash is stored in the database.
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@gosquatterz.com';
    const siteUrl = process.env.URL || 'https://gosquatterz.com';
    const firstName = name.split(' ')[0];

    if (resendKey) {
      let resumeLink = `${siteUrl}/portal/start`;
      try {
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo: `${siteUrl}/portal/start` },
        });
        if (!linkErr && linkData?.properties?.action_link) {
          resumeLink = linkData.properties.action_link;
        }
      } catch (e) {
        // Non-fatal - user can log in manually
        console.error('generateLink error');
      }

      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Squatterz <${fromEmail}>`,
          to: [email],
          subject: 'Continue setting up your Squatterz account',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
                <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">Commercial Services</div>
              </div>
              <h1 style="font-size:20px;font-weight:900;margin:0 0 12px;text-align:center;">Your account is ready</h1>
              <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
                Hi ${firstName},<br><br>
                Your Squatterz commercial account has been created. Use the link below to pick up where you left off and submit your first work order.
              </p>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${resumeLink}"
                   style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:14px 28px;border-radius:100px;text-decoration:none;">
                  Continue Setup &rarr;
                </a>
              </div>
              <p style="color:rgba(255,255,255,0.3);font-size:12px;text-align:center;">
                Or log in at <a href="${siteUrl}/portal/login" style="color:#22c55e;">${siteUrl}/portal/login</a>
              </p>
              <p style="color:rgba(255,255,255,0.2);font-size:11px;text-align:center;margin-top:16px;">
                This link expires in 1 hour. If you did not create this account, you can ignore this email.
              </p>
            </div>
          `,
        }),
      }).catch(() => console.error('Continuation email send failed'));
    }

    return jsonResponse({ success: true }, 201);
  } catch (e) {
    console.error('start-commercial-onboarding error');
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/start-commercial-onboarding' };
