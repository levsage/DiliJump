#!/usr/bin/env node
/**
 * Supabase health check for the DiliJump live leaderboard.
 *
 * Verifies a real Supabase project is set up as described in docs/SUPABASE.md:
 *   key type · migrations (RPCs) · RLS · no-login identities · realtime
 *
 * Usage:
 *   VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… node tools/supabase-healthcheck.mjs
 * (or run the "Supabase health check" GitHub Action, which uses repo secrets)
 *
 * Side effect: creates one hidden score-0 player named "HealthCheck"
 * (never shown on the leaderboard; remove with supabase/snippets/remove_test_players.sql).
 */
import { createClient } from '@supabase/supabase-js';

if (typeof globalThis.WebSocket === 'undefined') {
  console.error(
    '❌ Node.js 22+ is required (native WebSocket for the realtime check). You have ' +
      process.version,
  );
  process.exit(1);
}

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

// Player levels (v2.2): same formula as src/systems/PlayerLevel.js
{
  const fix = 'Run supabase/migrations/20260925120000_player_levels.sql in the SQL Editor';
  const { data, error } = await supabase.rpc('player_level', { p_total: 2500 });
  if (error)
    fail('migration', `player_level() ${isMissingFn(error) ? 'not found' : error.message}`, fix);
  else if (Number(data) !== 3) fail('migration', `player_level(2500) = ${data}, expected 3`, fix);
  else {
    const board = await supabase.rpc('get_leaderboard', { p_limit: 1 });
    const row = board.data?.[0];
    if (board.error || (row && !('level' in row && 'total_score' in row)))
      fail('migration', 'get_leaderboard() does not return level / total_score yet', fix);
    else
      ok('migration', 'Player levels: player_level() matches the game, leaderboard returns levels');
  }
}

// ---------------------------------------------------------------------------
// 3. No-login identity (random id + secret, like the game creates)
// ---------------------------------------------------------------------------
const { randomUUID, randomBytes } = await import('node:crypto');
const uid = randomUUID();
const secret = randomBytes(24).toString('hex');
const creds = { p_player_id: uid, p_secret: secret };

// ---------------------------------------------------------------------------
// 4. Validation & security
// ---------------------------------------------------------------------------
{
  const { error } = await supabase.rpc('submit_score', {
    ...creds,
    p_name: 'x',
    p_score: 1,
    p_coins: 0,
    p_height: 0,
    p_duration_ms: 1000,
  });
  if (error?.code === '22023')
    ok('migration', 'submit_score() exists and validates input (rejected 1-char name)');
  else if (isMissingFn(error)) {
    fail(
      'migration',
      'submit_score() not found',
      'Run supabase/migrations/20260923140000_no_login_players.sql (docs/SUPABASE.md step 2)',
    );
    report();
  } else
    fail(
      'migration',
      `submit_score() validation unexpected: ${error ? error.message : 'accepted an invalid name'}`,
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
      'Re-run migration 1; check RLS on public.players',
    );
}
{
  const { data, error } = await supabase.from('player_secrets').select('*').limit(1);
  if (error || (data ?? []).length === 0)
    ok('security', 'player_secrets is not readable by the public key');
  else
    fail(
      'security',
      'player_secrets is readable — secrets hashes are exposed!',
      'Re-run migration 2',
    );
}
{
  const { error } = await supabase.rpc('submit_score', {
    ...creds,
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
// 5. Realtime + a real (hidden, score 0) submission
// ---------------------------------------------------------------------------
{
  let gotEvent = false;
  let systemMsg = null;
  const subscribed = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), 15000);
    supabase
      .channel('healthcheck')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
        if (payload.new?.id === uid) gotEvent = true;
      })
      .on('system', {}, (msg) => {
        systemMsg = msg;
      })
      .subscribe((status, err) => {
        if (status !== 'CLOSED') {
          clearTimeout(timer);
          resolve(err ? `${status}: ${err.message}` : status);
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
    for (let i = 0; i < 40 && !systemMsg; i++) await new Promise((r) => setTimeout(r, 250));
    if (systemMsg && systemMsg.status !== 'ok') {
      fail(
        'realtime',
        `Realtime could not watch public.players: ${systemMsg.message ?? JSON.stringify(systemMsg)}`,
        'Database → Publications → supabase_realtime → toggle "players" on',
      );
    }
    const { data, error } = await supabase.rpc('submit_score', {
      ...creds,
      p_name: 'HealthCheck',
      p_score: 0,
      p_coins: 0,
      p_height: 0,
      p_duration_ms: 1000,
    });
    if (error) fail('migration', `submit_score() valid run failed: ${error.message}`);
    else
      ok(
        'migration',
        `submit_score() registered a no-login player (best_score=${data?.[0]?.best_score ?? '?'})`,
      );

    for (let i = 0; i < 40 && !gotEvent; i++) await new Promise((r) => setTimeout(r, 250));
    if (gotEvent) ok('realtime', 'Live updates work — change event received from public.players');
    else
      fail(
        'realtime',
        'Subscribed, but no change event arrived within 10 s',
        'Database → Publications → supabase_realtime → include "players"',
      );
  }
}

// ---------------------------------------------------------------------------
// 6. Wrong secret, rename, own rank
// ---------------------------------------------------------------------------
await new Promise((r) => setTimeout(r, 3100));
{
  const { error } = await supabase.rpc('rename_player', {
    p_player_id: uid,
    p_secret: 'w'.repeat(48),
    p_name: 'Hacked',
  });
  if (error?.code === '28000')
    ok('security', 'Wrong secret is rejected (cannot act as another player)');
  else fail('security', `Wrong secret not rejected: ${error?.message ?? 'rename succeeded'}`);
}
{
  const { error } = await supabase.rpc('rename_player', { ...creds, p_name: 'HealthCheck' });
  if (!error) ok('migration', 'rename_player() works with the right secret');
  else fail('migration', `rename_player() error: ${error.message}`);
}
{
  const { error } = await supabase.rpc('get_player_rank', { p_player_id: uid });
  if (!error) ok('migration', 'get_player_rank() works');
  else fail('migration', `get_player_rank() error: ${error.message}`, 'Run migration 2');
}

await supabase.removeAllChannels();
report();
