import {
  getServiceClient, getClientIp, checkRateLimit,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import {
  validateOtpRequest,
  issueContractorOtp,
  sendContractorCodeEmail,
} from './_shared/contractorAuth.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json();
    const validated = validateOtpRequest(body);
    if (!validated.ok) return errorResponse(validated.error);

    const ip = getClientIp(req);
    const supabase = getServiceClient();

    const ipAllowed = await checkRateLimit(supabase, ip, 'contractor-otp', 3600, 8);
    if (!ipAllowed) return errorResponse('Too many attempts. Please wait and try again.', 429);

    const emailAllowed = await checkRateLimit(supabase, validated.email, 'contractor-otp-email', 3600, 5);
    if (!emailAllowed) return errorResponse('Too many codes sent to that email. Please wait and try again.', 429);

    const result = await issueContractorOtp({
      supabase,
      intent: validated.intent,
      email: validated.email,
      sendEmail: sendContractorCodeEmail,
    });

    return jsonResponse(result.body, result.status);
  } catch (err) {
    console.error('contractor-otp error:', err?.message || 'unknown');
    return errorResponse('Could not send a sign-in code. Please try again.', 500);
  }
}

export const config = { path: '/api/contractor-otp' };
