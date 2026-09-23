import { LEADERBOARD } from '../../config/constants.js';

/**
 * Offline leaderboard stored in localStorage.
 *
 * Used when Supabase is not configured. Mirrors the online rules:
 * **one entry per person** (matched by name, case-insensitive) holding only
 * their highest score. Implements the same async interface as
 * `SupabaseLeaderboard` so the game does not care which one is active.
 */
export class LocalLeaderboard {
  constructor(storage, maxEntries = LEADERBOARD.MAX_ENTRIES) {
    this.storage = storage;
    this.maxEntries = maxEntries;
    this.mode = 'local';
    this.currentName = '';
    const saved = storage.get('leaderboard', []);
    this.entries = LocalLeaderboard.dedupe(
      Array.isArray(saved) ? saved.filter(LocalLeaderboard.isValid) : [],
    );
  }

  static isValid(e) {
    return e && typeof e.name === 'string' && Number.isFinite(e.score);
  }

  static key(name) {
    return String(name).trim().toLowerCase();
  }

  /** Highest score first; earlier achievement wins ties. */
  static compare(a, b) {
    return b.score - a.score || a.date - b.date;
  }

  /** Collapse legacy data (v1.0.0 stored every run) to one best entry per person. */
  static dedupe(entries) {
    const best = new Map();
    for (const e of entries) {
      const k = LocalLeaderboard.key(e.name);
      const cur = best.get(k);
      if (!cur || LocalLeaderboard.compare(e, cur) < 0) best.set(k, e);
    }
    return [...best.values()].sort(LocalLeaderboard.compare);
  }

  async init() {
    return this;
  }

  get isOnline() {
    return false;
  }

  /**
   * Submit a finished run. Keeps only the player's best score.
   * @returns {Promise<{ rank: number, isBest: boolean, bestScore: number, online: false }>}
   */
  async submit({ name, score, coins = 0, height = 0, date = Date.now() }) {
    this.currentName = name;
    const k = LocalLeaderboard.key(name);
    const existing = this.entries.find((e) => LocalLeaderboard.key(e.name) === k);
    const isBest = score > 0 && (!existing || score > existing.score);

    if (isBest) {
      const entry = { id: existing?.id ?? `local-${date}`, name, score, coins, height, date };
      this.entries = this.entries.filter((e) => e !== existing);
      this.entries.push(entry);
      this.entries.sort(LocalLeaderboard.compare);
      this.save();
    }

    const bestScore = Math.max(existing?.score ?? 0, score);
    return { rank: this.rankOf(name), isBest, bestScore, online: false };
  }

  rankOf(name) {
    const k = LocalLeaderboard.key(name);
    return this.entries.findIndex((e) => LocalLeaderboard.key(e.name) === k) + 1;
  }

  async top(limit = this.maxEntries) {
    const me = LocalLeaderboard.key(this.currentName);
    return this.entries.slice(0, limit).map((e, i) => ({
      ...e,
      rank: i + 1,
      isMe: Boolean(me) && LocalLeaderboard.key(e.name) === me,
    }));
  }

  async myEntry() {
    const rank = this.rankOf(this.currentName);
    return rank ? { ...this.entries[rank - 1], rank, isMe: true } : null;
  }

  async rename(oldName, newName) {
    this.currentName = newName;
    const k = LocalLeaderboard.key(oldName);
    const entry = this.entries.find((e) => LocalLeaderboard.key(e.name) === k);
    if (entry) {
      entry.name = newName;
      this.entries = LocalLeaderboard.dedupe(this.entries);
      this.save();
    }
  }

  setCurrentName(name) {
    this.currentName = name;
  }

  /** Local data never changes remotely — nothing to subscribe to. */
  subscribe() {
    return () => {};
  }

  clear() {
    this.entries = [];
    this.save();
  }

  save() {
    this.storage.set('leaderboard', this.entries.slice(0, 100));
  }
}
