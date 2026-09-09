import { supabase as sharedClient } from '../lib/supabase';

/**
 * Re-exports the single shared Supabase client.
 * Avoids creating a second GoTrueClient instance.
 */
export const supabase = sharedClient;

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
