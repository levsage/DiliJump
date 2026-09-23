import { LEADERBOARD } from '../../config/constants.js';

const PENDING_KEY = 'leaderboard:pending';
const RETRY_MS = 4000;
const TRANSIENT_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Live, global leaderboard backed by Supabase.
 *
 * - Players are identified with **anonymous sign-ins** (no email/password).
 * - Runs go through the `submit_run` RPC, which keeps **only the highest
 *   score per person** (see supabase/migrations).
 * - Changes to `public.players` are pushed through Supabase Realtime.
 * - If the network is down, the best unsent run is kept in localStorage
 *   and retried later, so a record is never lost.
 */
export class SupabaseLeaderboard {
  /**
   * @param {{ getClient: () => Promise<import('@supabase/supabase-js').SupabaseClient>,
   *           storage: import('../Storage.js').Storage, limit?: number }} deps
   */
  constructor({ getClient, storage, limit = LEADERBOARD.MAX_ENTRIES }) {
    this.getClient = getClient;
    this.storage = storage;
    this.limit = limit;
    this.mode = 'online';
    this.client = null;
    this.userId = null;
    this.readyPromise = null;
    this.retryTimer = null;
    this.lastError = null;
  }

  get isOnline() {
    return Boolean(this.userId);
  }

  /** Connect and sign in (idempotent). Never throws — failures are retried lazily. */
  init() {
    if (!this.readyPromise) {
      this.readyPromise = this.connect().catch((err) => {
        this.readyPromise = null; // allow a later retry
        this.lastError = err;
        throw err;
      });
      this.readyPromise.catch(() => {});
    }
    return this.readyPromise;
  }

  async connect() {
    this.client ??= await this.getClient();
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;

    let user = data?.session?.user;
    if (!user) {
      const res = await this.client.auth.signInAnonymously();
      if (res.error) throw res.error;
      user = res.data.user;
    }
    this.userId = user.id;
    this.lastError = null;
    this.flushPending();
    return this;
  }

  /**
   * Call a Postgres function. Transient auth errors are retried:
   * right after an anonymous sign-in, the token's `iat` can be a few hundred
   * ms ahead of the database server clock and PostgREST answers
   * 401 PGRST303 "JWT issued at future". Waiting a moment fixes it.
   */
  async rpc(fn, args, attempt = 0) {
    await this.init();
    const { data, error } = await this.client.rpc(fn, args);
    if (!error) return data;
    if (SupabaseLeaderboard.isTransient(error) && attempt < TRANSIENT_RETRIES) {
      await sleep(this.retryDelay(attempt));
      return this.rpc(fn, args, attempt + 1);
    }
    throw error;
  }

  retryDelay(attempt) {
    return 800 * (attempt + 1);
  }

  /** Clock-skew / expired-token errors that succeed on a retry. */
  static isTransient(err) {
    return (
      err?.code === 'PGRST303' ||
      err?.code === 'PGRST301' ||
      /issued at future|jwt expired/i.test(err?.message ?? '')
    );
  }

  /**
   * @returns {Promise<{ rank: number, isBest: boolean, bestScore: number, online: boolean, queued?: boolean, error?: string }>}
   */
  async submit({ name, score, coins = 0, height = 0, durationMs = 0 }) {
    const run = { name, score, coins, height, durationMs: Math.round(durationMs) };
    try {
      const rows = await this.rpc('submit_run', {
        p_name: run.name,
        p_score: run.score,
        p_coins: run.coins,
        p_height: run.height,
        p_duration_ms: run.durationMs,
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return {
        rank: Number(row?.rank ?? 0),
        isBest: Boolean(row?.is_best),
        bestScore: Number(row?.best_score ?? score),
        online: true,
      };
    } catch (err) {
      this.lastError = err;
      if (!SupabaseLeaderboard.isRejected(err)) this.queue(run);
      return {
        rank: 0,
        isBest: false,
        bestScore: score,
        online: false,
        queued: !SupabaseLeaderboard.isRejected(err),
        error: err?.message ?? String(err),
      };
    }
  }

  /** Validation errors from the server should not be retried. */
  static isRejected(err) {
    return err?.code === '22023' || err?.code === '28000';
  }

  /** Keep only the best unsent run — only the best matters for the board. */
  queue(run) {
    const pending = this.storage.get(PENDING_KEY);
    if (!pending || run.score > pending.score) this.storage.set(PENDING_KEY, run);
    this.scheduleRetry();
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.flushPending(), RETRY_MS);
  }

  async flushPending() {
    const pending = this.storage.get(PENDING_KEY);
    if (!pending) return;
    this.storage.remove(PENDING_KEY);
    await this.submit(pending); // re-queues itself on failure
  }

  static mapRow(r, userId) {
    return {
      id: r.player_id,
      rank: Number(r.rank),
      name: r.name,
      score: r.best_score,
      coins: r.best_coins,
      height: r.best_height,
      date: r.best_at ? Date.parse(r.best_at) : Date.now(),
      isMe: r.player_id === userId,
    };
  }

  async top(limit = this.limit) {
    const rows = await this.rpc('get_leaderboard', { p_limit: limit });
    return (rows ?? []).map((r) => SupabaseLeaderboard.mapRow(r, this.userId));
  }

  async myEntry() {
    const rows = await this.rpc('get_my_rank');
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? SupabaseLeaderboard.mapRow(row, this.userId) : null;
  }

  async rename(_oldName, newName) {
    try {
      await this.rpc('set_player_name', { p_name: newName });
    } catch (err) {
      this.lastError = err;
    }
  }

  setCurrentName() {}

  /**
   * Live updates. Calls `onChange()` (debounced) whenever any player's best
   * changes, and `onStatus(status)` with the realtime connection status.
   * @returns {() => void} unsubscribe
   */
  subscribe(onChange, onStatus = () => {}) {
    let channel = null;
    let timer = null;
    let closed = false;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 250);
    };

    this.init()
      .then(() => {
        if (closed) return;
        channel = this.client
          .channel('public:players:leaderboard')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fire)
          .subscribe((status) => onStatus(status));
      })
      .catch(() => onStatus('CHANNEL_ERROR'));

    return () => {
      closed = true;
      clearTimeout(timer);
      if (channel) this.client.removeChannel(channel);
    };
  }
}
