#!/usr/bin/env node
/**
 * Supabase health check for the DiliJump live leaderboard.
 *
 * Verifies a real Supabase project is set up as described in docs/SUPABASE.md:
 *   key type · anonymous sign-ins · migration (RPCs) · RLS · realtime
 *
 * Usage:
 *   VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… node tools/supabase-healthcheck.mjs
 * (or run the "Supabase health check" GitHub Action, which uses repo secrets)
 *
 * Side effect: creates one anonymous user with a hidden score-0 row
 * (named "HealthCheck"), which never appears on the leaderboard.
 */
import { createClient } from '@supabase/supabase-js';

const URL_ = (process.env.VITE_SUPABASE_URL ?? '').trim();
const KEY = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

const results = [];
const ok = (step, msg) => results.push({ pass: true, step, msg });
const fail = (step, msg, fix) => results.push({ pass: false, step, msg, fix });

function report() {
  console.log('\nDiliJump · Supabase health check\n');
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} [${r.step}] ${r.msg}`);
    if (!r.pass && r.fix) console.log(`      ↳ fix: ${r.fix}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(
    `\n${failed ? `❌ ${failed} check(s) failed` : '🎉 All checks passed — live leaderboard is ready'}\n`,
  );
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------
if (!URL_ || !KEY) {
  fail(
    'config',
    'VITE_SUPABASE_URL and/or VITE_SUPABASE_PUBLISHABLE_KEY is empty',
    'Add both repository secrets (Step 6)',
  );
  report();
}

if (/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(URL_))
  ok('config', 'Project URL format looks right');
else if (/^https:\/\//.test(URL_))
  ok('config', 'Project URL is https (custom domain or non-standard ref)');
else {
  fail(
    'config',
    'Project URL must look like https://<ref>.supabase.co',
    'Copy "Project URL" from Project Settings → Data API',
  );
  report();
}
if (/\/(rest|auth)\/v1/.test(URL_))
  fail(
    'config',
    'URL should not include /rest/v1 or /auth/v1',
    'Use only https://<ref>.supabase.co',
  );

if (KEY.startsWith('sb_secret_')) {
  fail(
    'key',
    'This is a SECRET key — it must never be used in the browser!',
    'Rotate it in Project Settings → API Keys, then use the sb_publishable_ key',
  );
  report();
} else if (KEY.startsWith('sb_publishable_')) {
  ok('key', 'Publishable key (sb_publishable_…) ✔ safe for the browser');
} else if (KEY.startsWith('eyJ')) {
  let role = '?';
  try {
    role = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64url').toString()).role;
  } catch {
    /* ignore */
  }
  if (role === 'service_role') {
    fail(
      'key',
      'This is the SERVICE_ROLE key — it bypasses all security!',
      'Rotate it immediately and use the publishable/anon key',
    );
    report();
  } else if (role === 'anon')
    ok('key', 'Legacy anon key ✔ (consider switching to the sb_publishable_ key)');
  else fail('key', `JWT key with unexpected role "${role}"`, 'Use the publishable key');
} else {
  fail(
    'key',
    'Key format not recognised',
    'Copy the Publishable key from Project Settings → API Keys',
  );
}

const supabase = createClient(URL_, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const isMissingFn = (e) =>
  e?.code === 'PGRST202' || /could not find the function/i.test(e?.message ?? '');

// ---------------------------------------------------------------------------
// 2. Migration: public read access
// ---------------------------------------------------------------------------
{
  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 10 });
  if (!error)
    ok('migration', `get_leaderboard() works for visitors — ${data.length} player(s) on the board`);
  else if (isMissingFn(error))
    fail(
      'migration',
      'get_leaderboard() not found',
      'Run supabase/migrations/…_live_leaderboard.sql in the SQL Editor (Step 3)',
    );
  else if (/invalid api key|jwt|apikey/i.test(error.message)) {
    fail(
      'key',
      `Key rejected by the project: ${error.message}`,
      'The key does not belong to this project URL',
    );
    report();
  } else fail('migration', `get_leaderboard() error: ${error.message}`);
}

// ---------------------------------------------------------------------------
// 3. Anonymous sign-ins
// ---------------------------------------------------------------------------
const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) {
  const captcha = /captcha/i.test(authErr.message);
  fail(
    'auth',
    `Anonymous sign-in failed: ${authErr.message}`,
    captcha
      ? 'CAPTCHA is enabled — the game needs Turnstile integration before CAPTCHA can be on'
      : 'Authentication → Sign In / Providers → enable "Allow anonymous sign-ins" (Step 2)',
  );
  report();
}
ok('auth', 'Anonymous sign-ins are enabled');
const uid = auth.user.id;

// ---------------------------------------------------------------------------
// 4. Server-side validation & RLS
// ---------------------------------------------------------------------------
{
  const { error } = await supabase.rpc('submit_run', {
    p_name: 'x',
    p_score: 1,
    p_coins: 0,
    p_height: 0,
    p_duration_ms: 1000,
  });
  if (error?.code === '22023')
    ok('migration', 'submit_run() exists and validates input (rejected 1-char name)');
  else if (isMissingFn(error))
    fail('migration', 'submit_run() not found', 'Re-run the migration (Step 3)');
  else
    fail(
      'migration',
      `submit_run() validation unexpected: ${error ? error.message : 'accepted an invalid name'}`,
    );
}
{
  const { error } = await supabase
    .from('players')
    .insert({ id: uid, name: 'Hacker', best_score: 999999 });
  if (error) ok('security', 'Direct writes to players are blocked (RLS / grants)');
  else
    fail(
      'security',
      'Direct INSERT into players succeeded — anyone could fake scores!',
      'Re-run the migration; check RLS is enabled on public.players',
    );
}
{
  const { error } = await supabase.rpc('submit_run', {
    p_name: 'HealthCheck',
    p_score: 99999999,
    p_coins: 0,
    p_height: 0,
    p_duration_ms: 1000,
  });
  if (error?.code === '22023') ok('security', 'Implausible scores are rejected (anti-cheat)');
  else
    fail(
      'security',
      `Anti-cheat check unexpected: ${error ? error.message : 'accepted an impossible score'}`,
    );
}

// ---------------------------------------------------------------------------
// 5. Realtime — subscribe, then cause a change and wait for the event
// ---------------------------------------------------------------------------
await new Promise((r) => setTimeout(r, 3100)); // respect the 3 s rate limit
{
  let gotEvent = false;
  const subscribed = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), 15000);
    supabase
      .channel('healthcheck')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
        if (payload.new?.id === uid) gotEvent = true;
      })
      .subscribe((status) => {
        if (status !== 'CLOSED') {
          clearTimeout(timer);
          resolve(status);
        }
      });
  });

  if (subscribed !== 'SUBSCRIBED') {
    fail(
      'realtime',
      `Realtime channel status: ${subscribed}`,
      'Check Realtime is enabled for the project',
    );
  } else {
    // score 0 → row is created but hidden from the leaderboard (best_score > 0 filter)
    const { data, error } = await supabase.rpc('submit_run', {
      p_name: 'HealthCheck',
      p_score: 0,
      p_coins: 0,
      p_height: 0,
      p_duration_ms: 1000,
    });
    if (error) fail('migration', `submit_run() valid run failed: ${error.message}`);
    else
      ok(
        'migration',
        `submit_run() accepted a valid run (best_score=${data?.[0]?.best_score ?? '?'})`,
      );

    for (let i = 0; i < 40 && !gotEvent; i++) await new Promise((r) => setTimeout(r, 250));
    if (gotEvent) ok('realtime', 'Live updates work — change event received from public.players');
    else
      fail(
        'realtime',
        'Subscribed, but no change event arrived within 10 s',
        'Database → Publications → supabase_realtime → include "players" (the game still polls every 15 s)',
      );
  }
}

// ---------------------------------------------------------------------------
// 6. Own rank RPC
// ---------------------------------------------------------------------------
{
  const { error } = await supabase.rpc('get_my_rank');
  if (!error) ok('migration', 'get_my_rank() works for signed-in players');
  else fail('migration', `get_my_rank() error: ${error.message}`, 'Re-run the migration (Step 3)');
}

await supabase.removeAllChannels();
report();
