import { PROFILE } from '../config/constants.js';
import { sanitizeName } from '../utils/format.js';

/** Stores the single local player's display name and personal best. */
export class ProfileService {
  constructor(storage) {
    this.storage = storage;
    this.data = {
      name: '',
      bestScore: 0,
      gamesPlayed: 0,
      ...storage.get('profile', {}),
    };
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
    const isBest = score > this.data.bestScore;
    if (isBest) this.data.bestScore = score;
    this.save();
    return isBest;
  }

  save() {
    this.storage.set('profile', this.data);
  }
}
