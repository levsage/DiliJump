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
    // profiles from before v2.2 have no XP yet: their best is a safe lower bound
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
   * Adopt the lifetime XP stored in the database (it includes the whole run
   * history). Never lowers the local value. @returns {boolean} changed
   */
  syncTotal(serverTotal) {
    const t = Number(serverTotal);
    if (!Number.isFinite(t) || t <= this.data.totalScore) return false;
    this.data.totalScore = t;
    this.save();
    return true;
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
