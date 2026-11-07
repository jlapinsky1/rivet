import {
  getServiceClient,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { provisionContractorBusiness } from './_shared/contractorAuth.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return errorResponse('Unauthorized', 401);

    const supabase = getServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(auth.slice(7));
    if (error || !user) return errorResponse('Unauthorized', 401);

    const body = await req.json().catch(() => ({}));
    const result = await provisionContractorBusiness({
      supabase,
      user,
      businessName: body?.businessName,
      contactName: body?.contactName,
      vertical: body?.vertical,
    });

    return jsonResponse(result.body, result.status);
  } catch (err) {
    console.error('provision-contractor error:', err?.message || 'unknown');
    return errorResponse('Could not create your business. Please try again.', 500);
  }
}

export const config = { path: '/api/provision-contractor' };
