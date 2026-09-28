import { describe, it, expect } from 'vitest';
import { Storage, MemoryBackend } from '../src/services/Storage.js';
import { WalletService } from '../src/services/WalletService.js';
import { SkinService } from '../src/services/SkinService.js';
import { DEFAULT_SKIN, SKINS, getSkin, skinPoseScale } from '../src/config/skins.js';

const setup = (balance = 0, saved) => {
  const storage = new Storage(new MemoryBackend(), 'test:');
  storage.set('wallet', { balance, lifetime: balance });
  if (saved) storage.set('skins', saved);
  const wallet = new WalletService(storage);
  return { storage, wallet, skins: new SkinService(storage, wallet) };
};

describe('skin catalog', () => {
  it('has the free classic skin plus the two DLI skins', () => {
    expect(SKINS.map((s) => s.id)).toEqual(['classic', 'wings', 'golden']);
    expect(getSkin('classic').price).toBe(0);
    expect(getSkin('wings').price).toBe(100);
    expect(getSkin('golden').price).toBe(200);
    expect(DEFAULT_SKIN).toBe('classic');
  });

  it('shows every body at the classic size in the UI', () => {
    for (const s of SKINS) {
      const k = skinPoseScale(s.id, 'idle');
      expect(k).toBeGreaterThan(0.8);
      expect(k).toBeLessThan(1.6);
    }
  });
});

describe('WalletService.spend', () => {
  it('pays from the balance and persists it', () => {
    const { wallet, storage } = setup(150);
    expect(wallet.spend(100)).toBe(true);
    expect(wallet.balance).toBe(50);
    expect(storage.get('wallet').balance).toBe(50);
    expect(wallet.lifetime).toBe(150); // lifetime earnings are not reduced
  });

  it('refuses to go negative or to spend nonsense amounts', () => {
    const { wallet } = setup(40);
    expect(wallet.spend(41)).toBe(false);
    expect(wallet.spend(-5)).toBe(false);
    expect(wallet.spend(1.5)).toBe(false);
    expect(wallet.spend(Number.NaN)).toBe(false);
    expect(wallet.balance).toBe(40);
  });
});

describe('SkinService', () => {
  it('starts with the classic skin owned and worn', () => {
    const { skins } = setup();
    expect(skins.equipped).toBe('classic');
    expect(skins.owns('classic')).toBe(true);
    expect(skins.owns('wings')).toBe(false);
  });

  it('buys a skin with DLI and remembers it', () => {
    const { skins, wallet, storage } = setup(120);
    expect(skins.buy('wings')).toEqual({ ok: true });
    expect(wallet.balance).toBe(20);
    expect(skins.owns('wings')).toBe(true);
    // a new session (reload) still owns it
    const again = new SkinService(storage, new WalletService(storage));
    expect(again.owns('wings')).toBe(true);
    expect(again.equipped).toBe('classic'); // buying does not force-wear it
  });

  it('cannot buy without enough coins, twice, or an unknown skin', () => {
    const { skins, wallet } = setup(150);
    expect(skins.missing('golden')).toBe(50);
    expect(skins.buy('golden')).toEqual({ ok: false, reason: 'funds' });
    expect(wallet.balance).toBe(150);
    expect(skins.buy('wings').ok).toBe(true);
    expect(skins.buy('wings')).toEqual({ ok: false, reason: 'owned' });
    expect(wallet.balance).toBe(50);
    expect(skins.buy('dragon')).toEqual({ ok: false, reason: 'unknown' });
    expect(skins.missing('wings')).toBe(0);
  });

  it('wears only owned skins, and the choice persists', () => {
    const { skins, storage, wallet } = setup(300);
    expect(skins.equip('golden')).toBe(false);
    expect(skins.equipped).toBe('classic');
    skins.buy('golden');
    expect(skins.equip('golden')).toBe(true);
    expect(new SkinService(storage, wallet).equipped).toBe('golden');
    expect(skins.equip('classic')).toBe(true);
  });

  it('ignores tampered or outdated saved data', () => {
    const { skins } = setup(0, { owned: ['dragon', 'wings'], equipped: 'golden' });
    expect(skins.owns('dragon')).toBe(false);
    expect(skins.owns('wings')).toBe(true);
    expect(skins.owns('classic')).toBe(true);
    expect(skins.equipped).toBe('classic'); // golden is not owned
    const broken = setup(0, 'garbage').skins;
    expect(broken.equipped).toBe('classic');
  });
});
