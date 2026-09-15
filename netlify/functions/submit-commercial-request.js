import {
  getServiceClient,
  checkRateLimit,
  getClientIp,
  jsonResponse,
  errorResponse,
} from './_shared/supabase.js';
import { sendCommercialJobEmails, linkUploadSessionPhotos, ensureCommercialClient } from './_shared/commercialRequest.js';

function buildPropertyNotes({ propType, propUnits, propNotes }) {
  return [
    propType ? `Type: ${propType}` : null,
    propUnits ? `Units: ${propUnits}` : null,
    propNotes || null,
  ].filter(Boolean).join('\n') || null;
}

function buildJobDescription({ jobService, jobDescription }) {
  return [jobService, jobDescription].filter(Boolean).join(' - ').trim();
}

function buildAccessNotes({ jobAccessNotes, jobPoRef }) {
  return [jobAccessNotes, jobPoRef ? `PO/Ref: ${jobPoRef}` : null].filter(Boolean).join('\n') || null;
}

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const supabase = getServiceClient();
    const ip = getClientIp(req);

    const allowed = await checkRateLimit(supabase, ip, 'submit-commercial-request', 3600, 10);
    if (!allowed) return errorResponse('Too many requests. Please try again later.', 429);

    const body = await req.json();
    const {
      idempotencyKey,
      name,
      email,
      password,
      phone,
      company,
      jobTitle,
      propName,
      propStreet,
      propCity,
      propState,
      propZip,
      propType,
      propUnits,
      propContactName,
      propContactPhone,
      propNotes,
      jobUnit,
      jobService,
      jobDescription,
      jobDate,
      jobAccessNotes,
      jobPoRef,
      uploadSessionId,
      attribution,
    } = body;

    if (!idempotencyKey) return errorResponse('idempotencyKey is required.');
    if (!name || !email || !password || !phone || !company) {
      return errorResponse('Name, email, password, phone, and company are required.');
    }
    if (password.length < 8) {
      return errorResponse('Password must be at least 8 characters.');
    }
    if (!propName || !propStreet || !propCity || !propState || !propZip || !propType) {
      return errorResponse('Property name, address, and type are required.');
    }
    if (!jobService || !jobDescription?.trim()) {
      return errorResponse('Service type and description are required.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const description = buildJobDescription({ jobService, jobDescription });
    const address = `${propStreet}, ${propCity}, ${propState} ${propZip}`.trim();

    // ── Idempotent retry: return existing job if this key was already submitted ──
    const { data: existingJob } = await supabase
      .from('jobs')
      .select('id, property_id, status')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingJob) {
      const { data: property } = await supabase
        .from('properties')
        .select('id, client_id')
        .eq('id', existingJob.property_id)
        .single();

      const { data: client } = property
        ? await supabase
            .from('commercial_clients')
            .select('id, user_id')
            .eq('id', property.client_id)
            .single()
        : { data: null };

      return jsonResponse({
        success: true,
        alreadySubmitted: true,
        clientId: client?.id || null,
        propertyId: existingJob.property_id,
        jobId: existingJob.id,
      }, 200);
    }

    // ── Verify email still available ──
    const { data: emailTaken } = await supabase.rpc('commercial_email_registered', {
      p_email: normalizedEmail,
    });
    if (emailTaken) {
      return errorResponse('An account with this email already exists. Please log in.', 409);
    }

    // ── Create auth user ──
    const { data: { user }, error: createErr } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, contact_name: name },
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
      console.error('submit-commercial-request createUser error');
      return errorResponse(createErr.message || 'Failed to create account.', 400);
    }

    if (!user) return errorResponse('Failed to create account.', 500);

    let clientId = null;
    let propertyId = null;
    let jobId = null;

    try {
      // Similar company names - internal log only
      const { data: similarOrgs } = await supabase
        .from('commercial_clients')
        .select('id')
        .ilike('company_name', `%${company.substring(0, 20)}%`)
        .neq('user_id', user.id)
        .limit(1);
      if (similarOrgs?.length > 0) {
        console.warn('submit-commercial-request: similar company name detected');
      }

      const client = await ensureCommercialClient(supabase, user.id, {
        company_name: company,
        contact_name: name,
        phone,
        job_title: jobTitle || null,
        onboarding_status: 'in_progress',
        last_onboarding_step: 3,
        attribution: attribution || {},
      });
      clientId = client.id;

      const { data: property, error: propErr } = await supabase
        .from('properties')
        .insert({
          client_id: clientId,
          name: propName,
          address,
          primary_contact_name: propContactName || null,
          primary_contact_phone: propContactPhone || null,
          notes: buildPropertyNotes({ propType, propUnits, propNotes }),
        })
        .select('id, name, address')
        .single();

      if (propErr || !property) {
        throw new Error('PROPERTY_INSERT_FAILED');
      }
      propertyId = property.id;

      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .insert({
          property_id: propertyId,
          unit: jobUnit || null,
          description,
          preferred_date: jobDate ? new Date(jobDate).toISOString() : null,
          access_notes: buildAccessNotes({ jobAccessNotes, jobPoRef }),
          status: 'pending_review',
          idempotency_key: idempotencyKey,
        })
        .select('id')
        .single();

      if (jobErr || !job) {
        throw new Error('JOB_INSERT_FAILED');
      }
      jobId = job.id;

      let photoCount = 0;
      try {
        photoCount = await linkUploadSessionPhotos(supabase, uploadSessionId, jobId, user.id);
      } catch (photoErr) {
        console.error('submit-commercial-request photo link failed:', photoErr?.message || photoErr);
      }

      await supabase
        .from('commercial_clients')
        .update({ onboarding_status: 'complete', last_onboarding_step: 3 })
        .eq('id', clientId);

      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@gosquatterz.com';
      const adminEmail = process.env.ADMIN_EMAIL;
      const siteUrl = process.env.URL || 'https://gosquatterz.com';

      try {
        await sendCommercialJobEmails({
          supabase,
          resendKey,
          fromEmail,
          adminEmail,
          siteUrl,
          client,
          clientEmail: normalizedEmail,
          property,
          job,
          unit: jobUnit,
          description,
          preferredDate: jobDate,
          photoCount,
          isNewAccount: true,
        });
      } catch (emailErr) {
        console.error('submit-commercial-request email failed:', emailErr?.message || emailErr);
      }

      return jsonResponse({
        success: true,
        clientId,
        propertyId,
        jobId,
      }, 201);
    } catch (stepErr) {
      console.error('submit-commercial-request post-auth step failed:', stepErr?.message || stepErr);

      await supabase
        .from('commercial_clients')
        .update({ onboarding_status: 'in_progress' })
        .eq('user_id', user.id);

      return jsonResponse({
        error: 'Account created but submission could not be completed. Please log in to finish submitting your request.',
        userCreated: true,
        partial: { clientId, propertyId, jobId },
      }, 500);
    }
  } catch {
    console.error('submit-commercial-request error');
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/submit-commercial-request' };
