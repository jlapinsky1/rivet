import {
  getServiceClient, getClientIp, checkRateLimit,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { email, password, contactName } = await req.json();

    if (!email || !password) return errorResponse('Email and password are required');
    if (password.length < 8) return errorResponse('Password must be at least 8 characters');

    const ip = getClientIp(req);
    const supabase = getServiceClient();

    // Rate limit: 5 signups per IP per hour
    const allowed = await checkRateLimit(supabase, ip, 'signup', 3600, 5);
    if (!allowed) return errorResponse('Too many signup attempts. Please wait.', 429);

    const siteUrl = process.env.URL || req.headers.get('origin') || '';

    // Use admin API to create the user and generate a confirmation link.
    // This does NOT trigger Supabase's own email - we send via Resend instead.
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { contact_name: contactName || '' },
        redirectTo: `${siteUrl}/portal`,
      },
    });

    if (error) {
      // Supabase returns a generic error for duplicate emails to prevent enumeration;
      // surface it so the client can show the right message.
      return errorResponse(error.message, 400);
    }

    const confirmationUrl = data?.properties?.action_link;
    if (!confirmationUrl) return errorResponse('Failed to generate confirmation link', 500);

    // Send confirmation email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return errorResponse('Email service not configured', 500);

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com';

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Squatterz <${fromEmail}>`,
        to: [email],
        subject: 'Confirm your Squatterz account',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
            <div style="text-align:center;margin-bottom:32px;">
              <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
              <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">Client Portal</div>
            </div>
            <h1 style="font-size:22px;font-weight:900;margin:0 0 12px;">Confirm your email</h1>
            <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 28px;">
              Hi${contactName ? ` ${contactName}` : ''},<br><br>
              Click the button below to confirm your email and activate your Squatterz commercial account.
            </p>
            <a href="${confirmationUrl}" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
              Confirm my account
            </a>
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;line-height:1.5;">
              If you didn't create an account, you can safely ignore this email.<br>
              This link expires in 24 hours.
            </p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.json().catch(() => ({}));
      console.error('Resend error:', resendError);
      return errorResponse('Failed to send confirmation email', 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Signup error:', err);
    return errorResponse('An unexpected error occurred', 500);
  }
}
