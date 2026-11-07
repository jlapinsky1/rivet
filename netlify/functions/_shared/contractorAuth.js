/**
 * Contractor sign-up and sign-in via one-time email codes.
 *
 * No password is collected or written. The account email lives in Supabase
 * Auth so the code can be delivered and the person recognized on return.
 * The one-time code is hashed by Supabase and expires; this app does not store it.
 */

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateBusinessName(name) {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) return { ok: false, error: 'Enter your business name.' };
  if (trimmed.length > 80) return { ok: false, error: 'Business name is too long.' };
  return { ok: true, name: trimmed };
}

export function validateContactName(name) {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1) return { ok: false, error: 'Enter your name.' };
  if (trimmed.length > 80) return { ok: false, error: 'Name is too long.' };
  return { ok: true, name: trimmed };
}

export function validateOtpRequest(body) {
  const intent = body?.intent === 'signup' || body?.intent === 'login' ? body.intent : null;
  if (!intent) return { ok: false, error: 'Choose sign up or sign in.' };

  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };

  if (intent === 'login') {
    return { ok: true, intent, email, businessName: '', contactName: '' };
  }

  const business = validateBusinessName(body?.businessName);
  if (!business.ok) return business;
  const contact = validateContactName(body?.contactName);
  if (!contact.ok) return contact;

  return { ok: true, intent, email, businessName: business.name, contactName: contact.name };
}

export function slugBase(name) {
  const base = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'business';
}

export function isAlreadyRegistered(error) {
  const msg = `${error?.message || ''}`.toLowerCase();
  const code = `${error?.code || ''}`.toLowerCase();
  return code === 'email_exists'
    || code === 'user_already_exists'
    || msg.includes('already been registered')
    || msg.includes('already registered')
    || msg.includes('already exists');
}

export function isPasswordRequired(error) {
  const msg = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  return msg.includes('password') && (
    msg.includes('required')
    || msg.includes('empty')
    || msg.includes('at least')
    || msg.includes('should be')
  );
}

export function isUserMissing(error) {
  if (!error) return false;
  const msg = `${error.message || ''}`.toLowerCase();
  const code = `${error.code || ''}`.toLowerCase();
  return code === 'user_not_found'
    || msg.includes('user not found')
    || msg.includes('user with this email not found')
    || (error.status === 404 && msg.includes('user'));
}

function isUniqueViolation(error) {
  return error?.code === '23505' || `${error?.message || ''}`.toLowerCase().includes('duplicate');
}

export async function allocateSlug(supabase, name) {
  const base = slugBase(name);
  for (let i = 0; i < 50; i++) {
    const candidate = (i === 0 ? base : `${base}-${i + 1}`).slice(0, 60);
    const { data, error } = await supabase
      .from('businesses')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`.slice(0, 60);
}

/**
 * Create a passwordless auth user when signing up, then issue a one-time code.
 * Login never creates a user. The code is handed only to sendEmail.
 */
export async function issueContractorOtp({ supabase, intent, email, sendEmail }) {
  let createdNew = false;
  let preissued = null;

  if (intent === 'signup') {
    const created = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (!created.error) {
      createdNew = true;
    } else if (isAlreadyRegistered(created.error)) {
      createdNew = false;
    } else if (isPasswordRequired(created.error)) {
      const invited = await supabase.auth.admin.generateLink({ type: 'invite', email });
      if (!invited.error && invited.data?.properties?.email_otp) {
        createdNew = true;
        preissued = invited.data;
      } else if (invited.error && isAlreadyRegistered(invited.error)) {
        createdNew = false;
      } else {
        throw invited.error || created.error;
      }
    } else {
      throw created.error;
    }
  }

  let linkData = preissued;
  if (!linkData) {
    const link = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data?.properties?.email_otp) {
      if (intent === 'login' && isUserMissing(link.error)) {
        return {
          status: 404,
          body: { error: 'No account for that email. Start free to create one.' },
        };
      }
      throw link.error || new Error('Could not create a sign-in code');
    }
    linkData = link.data;
  }

  await sendEmail({ to: email, code: linkData.properties.email_otp });

  return {
    status: 200,
    body: {
      sent: true,
      existingAccount: intent === 'signup' && !createdNew,
      verificationType: linkData.properties.verification_type || 'magiclink',
    },
  };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildContractorCodeEmail({ code }) {
  const safeCode = escapeHtml(code);
  return {
    subject: 'Your Rivet sign-in code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f6f5f1;color:#1a2b23;">
        <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;">Rivet</div>
        <h1 style="font-size:22px;font-weight:800;margin:24px 0 8px;">Your sign-in code</h1>
        <p style="color:#5c6b62;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Enter this code to continue. It expires in one hour.
        </p>
        <div style="font-size:32px;font-weight:800;letter-spacing:0.28em;background:#ffffff;border:1px solid #e6e3dc;border-radius:12px;padding:16px 20px;text-align:center;">
          ${safeCode}
        </div>
        <p style="color:#8b968e;font-size:12px;margin-top:24px;line-height:1.5;">
          If you didn't request this code, you can ignore this email.
        </p>
      </div>
    `,
  };
}

export async function sendContractorCodeEmail({ to, code }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error('Email service not configured');

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@myrivet.io';
  const from = fromEmail.includes('<') ? fromEmail : `Rivet <${fromEmail}>`;
  const message = buildContractorCodeEmail({ code });

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: message.subject,
      html: message.html,
    }),
  });

  if (!resendRes.ok) {
    console.error('Resend error status', resendRes.status);
    throw new Error('Failed to send sign-in code');
  }
}

export async function provisionContractorBusiness({ supabase, user, businessName, contactName }) {
  const { data: membership, error: memReadErr } = await supabase
    .from('business_memberships')
    .select('business_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memReadErr) throw memReadErr;
  if (membership?.business_id) {
    return { status: 200, body: { businessId: membership.business_id, created: false } };
  }

  const nameCheck = validateBusinessName(businessName);
  if (!nameCheck.ok) return { status: 400, body: { error: nameCheck.error } };

  let biz = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await allocateSlug(supabase, nameCheck.name);
    const inserted = await supabase
      .from('businesses')
      .insert({
        owner_user_id: user.id,
        name: nameCheck.name,
        slug,
        vertical: 'handyman',
        timezone: 'America/New_York',
        settings: {},
      })
      .select('id')
      .single();

    if (!inserted.error && inserted.data?.id) {
      biz = inserted.data;
      break;
    }
    lastError = inserted.error || new Error('Could not create the business');
    if (!isUniqueViolation(lastError)) throw lastError;
  }
  if (!biz) throw lastError;

  const membershipInsert = await supabase
    .from('business_memberships')
    .insert({
      business_id: biz.id,
      user_id: user.id,
      role: 'owner',
    });

  if (membershipInsert.error) {
    await supabase.from('businesses').delete().eq('id', biz.id);
    throw membershipInsert.error;
  }

  const contact = validateContactName(contactName);
  const display = contact.ok ? contact.name : '';
  if (display) {
    const { error: metaErr } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        display_name: display,
      },
    });
    if (metaErr) console.error('provision display name', metaErr.message);
  }

  return { status: 200, body: { businessId: biz.id, created: true } };
}
