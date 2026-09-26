import { PROFILE } from '../config/constants.js';
import { sanitizeName } from '../utils/format.js';
import { levelFromXp, levelProgress } from '../systems/PlayerLevel.js';

/**
 * Stores the single local player's display name, personal best and lifetime
 * XP (`totalScore`, the sum of all run scores → player level).
 */
export class ProfileService {
  constructor(storage) {
    this.storage = storage;
    this.data = {
      name: '',
      bestScore: 0,
      gamesPlayed: 0,
      ...storage.get('profile', {}),
    };
    // profiles from before v3.0 have no XP yet: their best is a safe lower bound
    if (!Number.isFinite(this.data.totalScore)) this.data.totalScore = this.data.bestScore;
  }

  get name() {
    return this.data.name || PROFILE.DEFAULT_NAME;
  }

  get hasName() {
    return Boolean(this.data.name);
  }

  get bestScore() {
    return this.data.bestScore;
  }

  get gamesPlayed() {
    return this.data.gamesPlayed;
  }

  get totalScore() {
    return this.data.totalScore;
  }

  get level() {
    return levelFromXp(this.data.totalScore);
  }

  get levelProgress() {
    return levelProgress(this.data.totalScore);
  }

  /**
   * Mirror the database, the source of truth for best score and lifetime XP —
   * up *or down* (e.g. after an admin resets the leaderboard). Runs the
   * database hasn't received yet (offline queue, submissions in progress) are
   * added on top, so nothing played on this device is lost.
   *
   * @param {{ bestScore: number, totalScore?: number|null }} server
   *   `totalScore` null/undefined = the database doesn't track XP yet → keep local
   * @param {{ score: number }[]} [unsynced]
   * @returns {boolean} whether anything changed
   */
  /** The player's own leaderboard row → server stats (no row = nothing on the board). */
  static statsFromEntry(entry) {
    return entry
      ? { bestScore: entry.score, totalScore: entry.totalScore }
      : { bestScore: 0, totalScore: 0 };
  }

  syncWithServer({ bestScore, totalScore }, unsynced = []) {
    const scores = unsynced.map((r) => Math.max(0, Math.floor(Number(r?.score) || 0)));
    const serverBest = Math.max(0, Math.floor(Number(bestScore) || 0));
    const unsyncedSum = scores.reduce((a, b) => a + b, 0);
    const best = Math.max(serverBest, ...scores);
    const bestDropped = best < this.data.bestScore; // the board was reset
    let changed = false;
    if (best !== this.data.bestScore) {
      this.data.bestScore = best;
      changed = true;
    }
    const serverTotal = totalScore === null || totalScore === undefined ? NaN : Number(totalScore);
    let total = this.data.totalScore;
    if (Number.isFinite(serverTotal)) total = Math.max(0, serverTotal) + unsyncedSum;
    // database without XP tracking + a reset: fall back to the safe lower bound
    else if (bestDropped) total = Math.min(total, serverBest + unsyncedSum);
    if (total !== this.data.totalScore) {
      this.data.totalScore = total;
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }

  /** @returns {{ ok: boolean, name?: string, error?: string }} */
  static validateName(raw) {
    const name = sanitizeName(raw, PROFILE.NAME_MAX);
    if (name.length < PROFILE.NAME_MIN) {
      return { ok: false, error: `Name must be at least ${PROFILE.NAME_MIN} characters` };
    }
    return { ok: true, name };
  }

  setName(raw) {
    const result = ProfileService.validateName(raw);
    if (result.ok) {
      this.data.name = result.name;
      this.save();
    }
    return result;
  }

  /** Records a finished run. Returns true when it is a new personal best. */
  recordRun(score) {
    this.data.gamesPlayed += 1;
    this.data.totalScore += Math.max(0, score);
    const isBest = score > this.data.bestScore;
    if (isBest) this.data.bestScore = score;
    this.save();
    return isBest;
  }

  save() {
    this.storage.set('profile', this.data);
  }
}
