import {
  getServiceClient, getClientIp, checkRateLimit,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  try {
    const url = new URL(req.url, 'http://localhost');
    const slug = url.searchParams.get('slug');
    if (!slug) return errorResponse('Missing slug parameter');

    const ip = getClientIp(req);
    const supabase = getServiceClient();

    // Rate limit: 60 requests per IP per minute
    const allowed = await checkRateLimit(supabase, ip, 'get-business-config', 60, 60);
    if (!allowed) {
      return errorResponse('Too many requests. Please wait.', 429);
    }

    const { data: business, error } = await supabase
      .from('businesses')
      .select('name, slug, vertical, timezone, settings')
      .eq('slug', slug)
      .single();

    if (error || !business) {
      return errorResponse('Business not found', 404);
    }

    const quoteFormConfig = business.settings?.quoteFormConfig || null;

    return jsonResponse({
      name: business.name,
      slug: business.slug,
      vertical: business.vertical || 'junk_removal',
      timezone: business.timezone || 'America/New_York',
      published: quoteFormConfig?.published ?? false,
      quoteFormConfig,
    });
  } catch (e) {
    console.error('get-business-config error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/public/business-config' };
