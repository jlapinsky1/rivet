import {
  getServiceClient, getClientIp, checkRateLimit,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { email } = await req.json();

    if (!email) return errorResponse('Email is required');

    const ip = getClientIp(req);
    const supabase = getServiceClient();

    // Rate limit: 5 reset requests per IP per hour
    const allowed = await checkRateLimit(supabase, ip, 'reset-password', 3600, 5);
    if (!allowed) return errorResponse('Too many attempts. Please wait.', 429);

    const siteUrl = process.env.URL || req.headers.get('origin') || '';

    // Generate a password recovery link via admin API.
    // Always return success to the client regardless of whether the email exists
    // (prevents email enumeration), but only send if the user is found.
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl}/portal/login`,
      },
    });

    // If the email doesn't exist Supabase returns an error - swallow it silently
    if (error || !data?.properties?.action_link) {
      return jsonResponse({ success: true });
    }

    const resetUrl = data.properties.action_link;
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
        subject: 'Reset your Squatterz password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
            <div style="text-align:center;margin-bottom:32px;">
              <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
              <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">Client Portal</div>
            </div>
            <h1 style="font-size:22px;font-weight:900;margin:0 0 12px;">Reset your password</h1>
            <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 28px;">
              We received a request to reset the password for your Squatterz account.<br><br>
              Click the button below to choose a new password. This link expires in 1 hour.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
              Reset my password
            </a>
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;line-height:1.5;">
              If you didn't request a password reset, you can safely ignore this email.<br>
              Your password will not be changed.
            </p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.json().catch(() => ({}));
      console.error('Resend error:', resendError);
      return errorResponse('Failed to send reset email', 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    return errorResponse('An unexpected error occurred', 500);
  }
}
