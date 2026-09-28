import { DEFAULT_SKIN, SKINS, getSkin } from '../config/skins.js';

/**
 * Dressing Room state: which skins the player owns and which one is worn.
 * Stored on this device (like the wallet); purchases are paid with DLI coins
 * from the WalletService.
 */
export class SkinService {
  constructor(storage, wallet) {
    this.storage = storage;
    this.wallet = wallet;
    const saved = storage.get('skins', {});
    const owned = Array.isArray(saved.owned) ? saved.owned.filter((id) => getSkin(id)) : [];
    // free skins are always owned
    for (const s of SKINS) if (s.price === 0 && !owned.includes(s.id)) owned.push(s.id);
    this.owned = new Set(owned);
    this.equipped = this.owned.has(saved.equipped) ? saved.equipped : DEFAULT_SKIN;
  }

  owns(id) {
    return this.owned.has(id);
  }

  /** Coins still missing to buy a skin (0 when affordable or owned). */
  missing(id) {
    const skin = getSkin(id);
    if (!skin || this.owns(id)) return 0;
    return Math.max(0, skin.price - this.wallet.balance);
  }

  /**
   * Buys a skin with DLI coins.
   * @returns {{ ok: boolean, reason?: 'unknown' | 'owned' | 'funds' }}
   */
  buy(id) {
    const skin = getSkin(id);
    if (!skin) return { ok: false, reason: 'unknown' };
    if (this.owns(id)) return { ok: false, reason: 'owned' };
    if (!this.wallet.spend(skin.price)) return { ok: false, reason: 'funds' };
    this.owned.add(id);
    this.save();
    return { ok: true };
  }

  /** @returns {boolean} whether the skin is now worn */
  equip(id) {
    if (!this.owns(id)) return false;
    this.equipped = id;
    this.save();
    return true;
  }

  save() {
    this.storage.set('skins', { owned: [...this.owned], equipped: this.equipped });
  }
}
