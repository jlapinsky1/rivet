import {
  getServiceClient, getClientIp, checkRateLimit,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { sessionId, fileName, contentType } = await req.json();

    if (!sessionId || !fileName) {
      return errorResponse('sessionId and fileName are required');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (!allowedExts.includes(ext)) {
      return errorResponse('File type not allowed. Use JPG, PNG, WebP, or HEIC.');
    }
    if (contentType && !allowedTypes.includes(contentType)) {
      return errorResponse('File type not allowed. Use JPG, PNG, WebP, or HEIC.');
    }

    const ip = getClientIp(req);
    const supabase = getServiceClient();

    // Rate limit: 30 upload URLs per IP per 10 minutes
    const allowed = await checkRateLimit(supabase, ip, 'get-upload-url', 600, 30);
    if (!allowed) {
      return errorResponse('Too many upload requests. Please wait.', 429);
    }

    // Verify session exists, is active, and not expired
    const { data: session, error: sessionErr } = await supabase
      .from('upload_sessions')
      .select('id, status, max_photos, max_file_bytes, expires_at, business_id')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return errorResponse('Invalid upload session');
    }

    if (session.status !== 'active') {
      return errorResponse('Upload session is no longer active');
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('upload_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId);
      return errorResponse('Upload session has expired. Please start over.');
    }

    // Check photo count limit
    const { count, error: countErr } = await supabase
      .from('session_photos')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (countErr) {
      console.error('Photo count error:', countErr);
      return errorResponse('Server error', 500);
    }

    if (count >= session.max_photos) {
      return errorResponse(`Maximum of ${session.max_photos} photos reached`);
    }

    // Generate server-controlled storage path with business_id prefix
    const bizPrefix = session.business_id || 'unknown';
    const storagePath = `${bizPrefix}/sessions/${sessionId}/${crypto.randomUUID()}.${ext}`;

    // Create signed upload URL
    const { data: urlData, error: urlErr } = await supabase.storage
      .from('booking-photos')
      .createSignedUploadUrl(storagePath);

    if (urlErr) {
      console.error('Storage URL error:', urlErr);
      return errorResponse('Failed to create upload URL', 500);
    }

    // Record photo in session_photos
    const { error: photoErr } = await supabase
      .from('session_photos')
      .insert({
        session_id: sessionId,
        storage_path: storagePath,
        file_name: fileName,
        content_type: contentType || 'image/jpeg',
        sort_order: count,
      });

    if (photoErr) {
      console.error('Photo record error:', photoErr);
      return errorResponse('Failed to record photo', 500);
    }

    return jsonResponse({
      signedUrl: urlData.signedUrl,
      storagePath,
      token: urlData.token,
    });
  } catch (e) {
    console.error('get-upload-url error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/get-upload-url' };
