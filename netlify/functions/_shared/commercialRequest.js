/**
 * Shared helpers for commercial estimate request submission emails.
 */

export async function ensureCommercialClient(supabase, userId, profile) {
  const deadline = Date.now() + 8000;

  while (Date.now() < deadline) {
    const { data: row } = await supabase
      .from('commercial_clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (row) {
      const { data: client, error } = await supabase
        .from('commercial_clients')
        .update(profile)
        .eq('user_id', userId)
        .select('id, company_name, contact_name, phone')
        .single();

      if (!error && client) return client;
      if (error) console.error('ensureCommercialClient update error:', error.message);
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('commercial_clients')
    .insert({
      user_id: userId,
      contact_name: profile.contact_name || '',
      company_name: profile.company_name || null,
      phone: profile.phone || null,
      job_title: profile.job_title ?? null,
      onboarding_status: profile.onboarding_status || 'in_progress',
      last_onboarding_step: profile.last_onboarding_step ?? 3,
      attribution: profile.attribution || {},
    })
    .select('id, company_name, contact_name, phone')
    .single();

  if (insertErr || !inserted) {
    throw new Error(`CLIENT_ENSURE_FAILED:${insertErr?.message || 'unknown'}`);
  }

  return inserted;
}

export async function sendCommercialJobEmails({
  supabase,
  resendKey,
  fromEmail,
  adminEmail,
  siteUrl,
  client,
  clientEmail,
  property,
  job,
  unit,
  description,
  preferredDate,
  photoCount = 0,
  isNewAccount = false,
}) {
  if (!resendKey) return;

  const shortId = `#${job.id.slice(0, 8).toUpperCase()}`;
  const firstName = client.contact_name ? client.contact_name.split(' ')[0] : 'there';
  const emailPromises = [];

  if (clientEmail) {
    emailPromises.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Squatterz <${fromEmail}>`,
          to: [clientEmail],
          subject: `Request received - ${shortId}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
                <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">Commercial Services</div>
              </div>
              <h1 style="font-size:20px;font-weight:900;margin:0 0 12px;text-align:center;">Request received</h1>
              <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
                Hi ${firstName},<br><br>
                Your estimate request for <strong style="color:#fff;">${property.name}</strong> has been submitted.
                We'll review it and reach out to confirm scheduling.
              </p>
              <div style="background:#111;border:1px solid #222;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:rgba(255,255,255,0.4);font-size:13px;">Reference</span>
                  <span style="color:#22c55e;font-family:monospace;font-weight:700;font-size:13px;">${shortId}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:rgba(255,255,255,0.4);font-size:13px;">Status</span>
                  <span style="color:#fff;font-size:13px;font-weight:600;">Under review</span>
                </div>
              </div>
              <div style="text-align:center;">
                <a href="${siteUrl}/portal"
                   style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:14px 28px;border-radius:100px;text-decoration:none;">
                  View in Client Portal &rarr;
                </a>
              </div>
            </div>
          `,
        }),
      }).catch(() => console.error('Client confirmation email failed'))
    );
  }

  if (adminEmail) {
    emailPromises.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Squatterz <${fromEmail}>`,
          to: [adminEmail],
          subject: isNewAccount
            ? `New commercial account + estimate request ${shortId} - ${client.company_name || client.contact_name}`
            : `New commercial estimate request ${shortId} - ${property.name}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;padding:24px;">
              <h2>${isNewAccount ? 'New Commercial Account + Estimate Request' : 'New Commercial Estimate Request'}</h2>
              <p><strong>Company:</strong> ${client.company_name || 'N/A'}</p>
              <p><strong>Contact:</strong> ${client.contact_name || 'N/A'}</p>
              <p><strong>Email:</strong> ${clientEmail || 'N/A'}</p>
              <p><strong>Phone:</strong> ${client.phone || 'N/A'}</p>
              <hr>
              <p><strong>Property:</strong> ${property.name} - ${property.address}</p>
              <p><strong>Job Reference:</strong> ${shortId}</p>
              ${unit ? `<p><strong>Unit / Location:</strong> ${unit}</p>` : ''}
              ${description ? `<p><strong>Description:</strong> ${description}</p>` : ''}
              ${preferredDate ? `<p><strong>Preferred Date:</strong> ${new Date(preferredDate).toLocaleDateString()}</p>` : ''}
              ${photoCount > 0 ? `<p><strong>Photos:</strong> ${photoCount} submitted</p>` : ''}
              <p><a href="${siteUrl}/admin/commercial">Review in Admin &rarr;</a></p>
            </div>
          `,
        }),
      }).catch(() => console.error('Admin notification email failed'))
    );
  }

  await Promise.all(emailPromises);
}

export async function linkUploadSessionPhotos(supabase, uploadSessionId, jobId, userId) {
  if (!uploadSessionId) return 0;

  const { data: sessionPhotos } = await supabase
    .from('session_photos')
    .select('storage_path, file_name, content_type')
    .eq('session_id', uploadSessionId);

  if (!sessionPhotos?.length) return 0;

  let linked = 0;
  for (const photo of sessionPhotos) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('booking-photos')
      .download(photo.storage_path);
    if (dlErr || !blob) continue;

    const safeName = (photo.file_name || 'photo.jpg').replace(/[^a-z0-9._-]/gi, '_');
    const destPath = `submissions/${userId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from('job-photos')
      .upload(destPath, blob, { contentType: photo.content_type || 'image/jpeg', upsert: false });

    if (upErr) continue;

    const { error: insErr } = await supabase.from('job_photos').insert({
      job_id: jobId,
      kind: 'submission',
      storage_path: destPath,
    });

    if (!insErr) linked += 1;
  }

  return linked;
}
