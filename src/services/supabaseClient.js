/**
 * Lazily-created Supabase client — used purely as a database + realtime
 * connection. There is NO login: Supabase Auth is not used at all.
 *
 * Configuration comes from Vite env variables (Vercel → Project → Settings →
 * Environment Variables, or `.env.local` for development):
 *   VITE_SUPABASE_URL              https://<project-ref>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…  (or the legacy anon key)
 *
 * The publishable key is designed to be public; access is enforced by Row
 * Level Security and the SQL functions in `supabase/migrations`. NEVER put a
 * secret / service_role key here.
 *
 * supabase-js is dynamically imported so it is split into its own chunk and
 * not downloaded at all when Supabase is not configured.
 */
const env = import.meta.env ?? {};
const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').trim();
const SUPABASE_KEY = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

let clientPromise = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    return Promise.reject(new Error('Supabase is not configured'));
  }
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    // Clean up the session left by v1.1 (anonymous sign-ins are no longer used).
    try {
      globalThis.localStorage?.removeItem('dilijump:auth');
    } catch {
      /* ignore */
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  });
  return clientPromise;
}
