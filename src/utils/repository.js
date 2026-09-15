/**
 * Repository factory.
 *
 * Returns the Supabase repository when configured, otherwise falls back
 * to localStorage for development/demo mode.
 *
 * UI components import `repo` and call async methods. They never import
 * localStorage or Supabase directly.
 */

import { isSupabaseConfigured } from './supabaseClient';

let _repo = null;

export async function getRepo() {
  if (_repo) return _repo;

  if (isSupabaseConfigured()) {
    const { default: supabaseRepo } = await import('./repositories/supabaseRepo');
    _repo = supabaseRepo;
  } else {
    const { default: local } = await import('./repositories/local');
    _repo = local;
    console.info('[repo] Using localStorage (development mode). Set VITE_SUPABASE_URL to enable Supabase.');
  }

  return _repo;
}

/**
 * Synchronous accessor - only safe after first `await getRepo()`.
 * Throws if called before initialization.
 */
export function repo() {
  if (!_repo) throw new Error('Repository not initialized. Call await getRepo() first.');
  return _repo;
}
