import { LEADERBOARD } from '../../config/constants.js';
import { levelFromXp } from '../../systems/PlayerLevel.js';

const PENDING_KEY = 'leaderboard:pending';
const RETRY_MS = 4000;
/** Unsent runs kept while offline (every run counts towards the level). */
const MAX_PENDING = 30;
/** Gap between flushing queued runs (the database allows one run per 3 s). */
const FLUSH_GAP_MS = 3300;

/** Number or null (columns missing on databases from before v3.0). */
const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Live, global leaderboard stored directly in the Supabase database.
 * No backend server and no login:
 *
 * - The player is identified by a random id + secret kept in the browser
 *   (`PlayerIdentity`). The database stores only a hash of the secret.
 * - Runs go through the `submit_score` SQL function, which keeps **only the
 *   highest score per person** on the board and adds every run to the
 *   player's lifetime XP → level (see supabase/migrations).
 * - Changes to `public.players` are pushed through Supabase Realtime.
 * - If the network is down, unsent runs are kept in localStorage and retried
 *   later, so neither a record nor any XP is lost.
 */
export class SupabaseLeaderboard {
  /**
   * @param {{ getClient: () => Promise<import('@supabase/supabase-js').SupabaseClient>,
   *           storage: import('../Storage.js').Storage,
   *           identity: import('../PlayerIdentity.js').PlayerIdentity,
   *           limit?: number }} deps
   */
  constructor({ getClient, storage, identity, limit = LEADERBOARD.MAX_ENTRIES }) {
    this.getClient = getClient;
    this.storage = storage;
    this.identity = identity;
    this.limit = limit;
    this.mode = 'online';
    this.client = null;
    this.readyPromise = null;
    this.retryTimer = null;
    this.lastError = null;
  }

  get playerId() {
    return this.identity.playerId;
  }

  get isOnline() {
    return Boolean(this.client);
  }

  /** Create the client (idempotent) and flush any unsent run. */
  init() {
    if (!this.readyPromise) {
      this.readyPromise = this.getClient().then((client) => {
        this.client = client;
        this.flushPending();
        return this;
      });
      this.readyPromise.catch((err) => {
        this.readyPromise = null; // allow a later retry
        this.lastError = err;
      });
    }
    return this.readyPromise;
  }

  async rpc(fn, args) {
    await this.init();
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw error;
    return data;
  }

  credentials() {
    const { playerId, secret } = this.identity.get();
    return { p_player_id: playerId, p_secret: secret };
  }

  /**
   * @returns {Promise<{ rank: number, isBest: boolean, bestScore: number, online: boolean,
   *   totalScore?: number|null, level?: number|null, prevLevel?: number|null,
   *   queued?: boolean, error?: string }>}
   *   `totalScore` / `level` are null when the database predates player levels.
   */
  async submit({ name, score, coins = 0, height = 0, durationMs = 0 }) {
    const run = { name, score, coins, height, durationMs: Math.round(durationMs) };
    try {
      const rows = await this.rpc('submit_score', {
        ...this.credentials(),
        p_name: run.name,
        p_score: run.score,
        p_coins: run.coins,
        p_height: run.height,
        p_duration_ms: run.durationMs,
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      this.identity.markRegistered?.();
      const totalScore = numOrNull(row?.total_score);
      return {
        rank: Number(row?.rank ?? 0),
        isBest: Boolean(row?.is_best),
        bestScore: Number(row?.best_score ?? score),
        totalScore,
        level: numOrNull(row?.level),
        prevLevel: numOrNull(row?.prev_level),
        online: true,
      };
    } catch (err) {
      this.lastError = err;
      const rejected = SupabaseLeaderboard.isRejected(err);
      if (!rejected) this.queue(run);
      return {
        rank: 0,
        isBest: false,
        bestScore: score,
        online: false,
        queued: !rejected,
        error: err?.message ?? String(err),
      };
    }
  }

  /** Validation / credential errors from the database are final — don't retry. */
  static isRejected(err) {
    return err?.code === '22023' || err?.code === '28000';
  }

  /** Unsent runs (oldest first). Older versions stored a single run object. */
  pending() {
    const p = this.storage.get(PENDING_KEY);
    if (Array.isArray(p)) return p;
    return p && Number.isFinite(p.score) ? [p] : [];
  }

  /** Keep unsent runs — each one adds XP, the best one may be a record. */
  queue(run) {
    let list = [...this.pending(), run];
    if (list.length > MAX_PENDING) {
      // over the cap: drop the smallest scores, keep the order of the rest
      const keep = new Set([...list].sort((a, b) => b.score - a.score).slice(0, MAX_PENDING));
      list = list.filter((r) => keep.has(r));
    }
    this.storage.set(PENDING_KEY, list);
    this.scheduleRetry();
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.flushPending(), RETRY_MS);
  }

  /** Send queued runs one by one (respecting the 3 s rate limit). */
  async flushPending() {
    const [next, ...rest] = this.pending();
    if (!next) return;
    if (rest.length) this.storage.set(PENDING_KEY, rest);
    else this.storage.remove(PENDING_KEY);
    const res = await this.submit(next); // re-queues itself on failure
    if (res.online && rest.length) {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.flushPending(), FLUSH_GAP_MS);
    }
  }

  static mapRow(r, playerId) {
    const totalScore = numOrNull(r.total_score);
    return {
      id: r.player_id,
      rank: Number(r.rank),
      name: r.name,
      score: r.best_score,
      coins: r.best_coins,
      height: r.best_height,
      date: r.best_at ? Date.parse(r.best_at) : Date.now(),
      totalScore,
      level: numOrNull(r.level) ?? (totalScore === null ? null : levelFromXp(totalScore)),
      isMe: r.player_id === playerId,
    };
  }

  async top(limit = this.limit) {
    const rows = await this.rpc('get_leaderboard', { p_limit: limit });
    return (rows ?? []).map((r) => SupabaseLeaderboard.mapRow(r, this.playerId));
  }

  async myEntry() {
    const rows = await this.rpc('get_player_rank', { p_player_id: this.playerId });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? SupabaseLeaderboard.mapRow(row, this.playerId) : null;
  }

  /**
   * Rename on the board. Before the first accepted run the player doesn't
   * exist in the database yet — the name is simply sent with that first run.
   */
  async rename(_oldName, newName) {
    if (this.identity.registered === false) return;
    try {
      await this.rpc('rename_player', { ...this.credentials(), p_name: newName });
    } catch (err) {
      if (err?.code !== '28000') this.lastError = err; // 28000 = not registered yet
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
