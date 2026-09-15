/**
 * POST /api/dispatch-photo-upload-url
 *
 * Returns a signed upload URL for a single crew or issue photo.
 * The storage path is server-generated and returned only so the client
 * can pass it back to /api/dispatch-photo for DB registration.
 * After registration the client must discard the path - it must never
 * be rendered in the UI or used as a read URL.
 */

import { getServiceClient, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';
import { randomUUID } from 'crypto';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);

const EXT_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const ALLOWED_KINDS = new Set(['before', 'after', 'issue']);

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const { bookingId, fileName, contentType, kind } = body;

    if (!bookingId)    return errorResponse('bookingId is required');
    if (!fileName)     return errorResponse('fileName is required');
    if (!contentType)  return errorResponse('contentType is required');
    if (!kind)         return errorResponse('kind is required');

    if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
      return errorResponse('Unsupported file type. Allowed: JPEG, PNG, WebP, HEIC');
    }

    if (!ALLOWED_KINDS.has(kind)) {
      return errorResponse(`Invalid kind '${kind}'. Allowed: before, after, issue`);
    }

    const supabase = getServiceClient();

    // Verify booking exists
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // Generate server-controlled storage path
    const ext = EXT_MAP[contentType.toLowerCase()] ?? 'jpg';
    const uniqueId = randomUUID();
    const storagePath = `completions/${bookingId}/${kind}/${uniqueId}.${ext}`;

    const { data: signedData, error: signedErr } = await supabase.storage
      .from('booking-photos')
      .createSignedUploadUrl(storagePath);

    if (signedErr || !signedData) {
      console.error('dispatch-photo-upload-url: failed to create signed URL:', signedErr);
      return errorResponse('Failed to create upload URL', 500);
    }

    // storagePath is returned for registration only - client must not use it to read photos
    return jsonResponse({
      signedUrl:   signedData.signedUrl,
      storagePath, // registration-only; discard after calling /api/dispatch-photo
    });

  } catch (e) {
    console.error('dispatch-photo-upload-url error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/dispatch-photo-upload-url' };
