import { LocalLeaderboard } from './LocalLeaderboard.js';
import { SupabaseLeaderboard } from './SupabaseLeaderboard.js';
import { getSupabase, isSupabaseConfigured } from '../supabaseClient.js';

export { LocalLeaderboard, SupabaseLeaderboard };

/**
 * Picks the leaderboard backend:
 * - Supabase (live, global) when VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY are set
 * - localStorage otherwise (offline / local development)
 */
export function createLeaderboard(storage) {
  if (isSupabaseConfigured()) {
    return new SupabaseLeaderboard({ getClient: getSupabase, storage });
  }
  return new LocalLeaderboard(storage);
}
