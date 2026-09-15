import {
  getServiceClient, sha256, jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { getStripeClient, getPaymentSummaryDTO } from './_shared/stripe.js';

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) return errorResponse('token is required');

    const tokenHash = await sha256(token);
    const supabase = getServiceClient();

    // ── Validate payment access token ────────────────────────────────────────
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('payment_access_tokens')
      .select('id, booking_id, expires_at, used_at, revoked_at, purpose')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (
      tokenErr ||
      !tokenRow ||
      tokenRow.revoked_at ||
      tokenRow.purpose !== 'final_payment' ||
      new Date(tokenRow.expires_at) < new Date()
    ) {
      return errorResponse('This link is invalid or has expired', 400);
    }

    const bookingId = tokenRow.booking_id;

    // ── Load booking (customer-safe fields only) ──────────────────────────────
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(
        'id, status, full_address, quantity, description, approved_quote, ' +
        'stripe_invoice_id, stripe_final_payment_intent_id, financially_completed_at'
      )
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // ── Load completion record (customer-safe fields only) ────────────────────
    const { data: completion, error: completionErr } = await supabase
      .from('booking_completions')
      .select(
        'completed_at, technician_name, items_removed, volume_estimate, ' +
        'completion_notes, disposal_notes, final_amount_cents'
      )
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (completionErr) {
      console.error('Failed to load completion record:', completionErr);
      return errorResponse('Unable to load job details', 500);
    }

    if (!completion) {
      return errorResponse('Job completion data not yet available', 404);
    }

    // ── Load photos (up to 4 before, up to 4 after) ───────────────────────────
    const { data: photos } = await supabase
      .from('booking_photos')
      .select('storage_path, kind, sort_order')
      .eq('booking_id', bookingId)
      .in('kind', ['before', 'after'])
      .order('kind', { ascending: true })
      .order('sort_order', { ascending: true });

    const beforePhotos = (photos ?? []).filter(p => p.kind === 'before').slice(0, 4);
    const afterPhotos  = (photos ?? []).filter(p => p.kind === 'after').slice(0, 4);

    // Generate signed URLs (1-hour expiry) - never expose raw storage paths
    async function signedUrl(storagePath) {
      const { data, error } = await supabase.storage
        .from('booking-photos')
        .createSignedUrl(storagePath, 3600);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    }

    const [beforeSignedUrls, afterSignedUrls] = await Promise.all([
      Promise.all(beforePhotos.map(p => signedUrl(p.storage_path))),
      Promise.all(afterPhotos.map(p => signedUrl(p.storage_path))),
    ]);

    // ── Load Stripe payment summary ────────────────────────────────────────────
    let payment = null;
    let clientSecret = null;

    if (booking.stripe_invoice_id) {
      try {
        const stripe = getStripeClient();

        // hostedInvoiceUrl hidden on final page - customer pays via Payment Element
        const dto = await getPaymentSummaryDTO(stripe, booking.stripe_invoice_id, false);
        payment = {
          invoiceTotalCents: dto.invoiceTotalCents,
          amountPaidCents: dto.amountPaidCents,
          amountRemainingCents: dto.amountRemainingCents,
          invoiceStatus: dto.invoiceStatus,
          invoicePdfUrl: dto.invoicePdfUrl,
        };

        // Retrieve final PI client_secret (needed by Payment Element)
        if (booking.stripe_final_payment_intent_id && dto.amountRemainingCents > 0) {
          const pi = await stripe.paymentIntents.retrieve(
            booking.stripe_final_payment_intent_id
          );
          if (pi.status !== 'succeeded' && pi.status !== 'canceled') {
            clientSecret = pi.client_secret;
          }
        }
      } catch (stripeErr) {
        console.error('Failed to load Stripe data for final page:', stripeErr.message, { bookingId });
        // Non-fatal: return page without payment section; customer can refresh
      }
    }

    const baseUrl = process.env.URL || 'https://squatterz.com';

    return jsonResponse({
      booking: {
        id: booking.id,
        address: booking.full_address,
        quantity: booking.quantity,
        description: booking.description,
        approvedQuote: booking.approved_quote,
        financiallyCompletedAt: booking.financially_completed_at,
      },
      completion: {
        completedAt: completion.completed_at,
        technicianName: completion.technician_name,
        itemsRemoved: completion.items_removed,
        volumeEstimate: completion.volume_estimate,
        completionNotes: completion.completion_notes,
        disposalNotes: completion.disposal_notes,
        finalAmountCents: completion.final_amount_cents,
      },
      beforePhotoSignedUrls: beforeSignedUrls.filter(Boolean),
      afterPhotoSignedUrls: afterSignedUrls.filter(Boolean),
      payment,
      clientSecret,
      completionPdfPath: `${baseUrl}/api/residential-completion-pdf?token=${token}`,
    });

  } catch (e) {
    console.error('get-final-job-page error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/get-final-job-page' };
