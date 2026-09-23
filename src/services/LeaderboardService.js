import { LEADERBOARD } from '../config/constants.js';

/**
 * Local top-N leaderboard.
 * Entries are sorted by score (desc), then coins (desc), then earliest date.
 * The service is storage-agnostic so it can later be backed by a remote API.
 */
export class LeaderboardService {
  constructor(storage, maxEntries = LEADERBOARD.MAX_ENTRIES) {
    this.storage = storage;
    this.maxEntries = maxEntries;
    const saved = storage.get('leaderboard', []);
    this.entries = Array.isArray(saved) ? saved.filter(LeaderboardService.isValid) : [];
    this.sort();
  }

  static isValid(e) {
    return e && typeof e.name === 'string' && Number.isFinite(e.score);
  }

  static compare(a, b) {
    return b.score - a.score || (b.coins ?? 0) - (a.coins ?? 0) || a.date - b.date;
  }

  sort() {
    this.entries.sort(LeaderboardService.compare);
  }

  /** Would `score` make it onto the board? */
  qualifies(score) {
    if (score <= 0) return false;
    if (this.entries.length < this.maxEntries) return true;
    return score > this.entries[this.entries.length - 1].score;
  }

  /**
   * Submit a run. Returns the 1-based rank achieved, or 0 if it did not place.
   */
  submit({ name, score, coins = 0, height = 0, date = Date.now() }) {
    if (!this.qualifies(score)) return 0;
    const entry = {
      id: `${date}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      score,
      coins,
      height,
      date,
    };
    this.entries.push(entry);
    this.sort();
    this.entries = this.entries.slice(0, this.maxEntries);
    this.save();
    const rank = this.entries.findIndex((e) => e.id === entry.id) + 1;
    return rank;
  }

  top(n = this.maxEntries) {
    return this.entries.slice(0, n);
  }

  clear() {
    this.entries = [];
    this.save();
  }

  save() {
    this.storage.set('leaderboard', this.entries);
  }
}
