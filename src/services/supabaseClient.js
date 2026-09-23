/**
 * Lazily-created Supabase client.
 *
 * Configuration comes from Vite env variables (see `.env.example`):
 *   VITE_SUPABASE_URL              https://<project-ref>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…  (or the legacy anon key)
 *
 * The publishable key is designed to be public; access is enforced by the
 * Row Level Security policies in `supabase/migrations`. NEVER put a secret /
 * service_role key here.
 *
 * supabase-js is loaded with a dynamic import so it is split into its own
 * chunk and not downloaded at all when Supabase is not configured.
 */
const env = import.meta.env ?? {};
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

let clientPromise = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    return Promise.reject(new Error('Supabase is not configured'));
  }
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'dilijump:auth',
      },
      realtime: { params: { eventsPerSecond: 5 } },
    }),
  );
  return clientPromise;
}
