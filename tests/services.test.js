import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, MemoryBackend } from '../src/services/Storage.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { WalletService } from '../src/services/WalletService.js';

let storage;
beforeEach(() => {
  storage = new Storage(new MemoryBackend(), 'test:');
});

describe('Storage', () => {
  it('round-trips JSON values', () => {
    storage.set('k', { a: 1 });
    expect(storage.get('k')).toEqual({ a: 1 });
  });
  it('returns fallback for missing / corrupt data', () => {
    storage.backend.setItem('test:bad', '{nope');
    expect(storage.get('bad', 'fb')).toBe('fb');
    expect(storage.get('missing', 5)).toBe(5);
  });
});

describe('ProfileService', () => {
  it('validates names', () => {
    expect(ProfileService.validateName('a').ok).toBe(false);
    expect(ProfileService.validateName('  Dili  ').name).toBe('Dili');
  });

  it('tracks best score and games played', () => {
    const p = new ProfileService(storage);
    expect(p.recordRun(100)).toBe(true);
    expect(p.recordRun(50)).toBe(false);
    expect(p.bestScore).toBe(100);
    expect(p.gamesPlayed).toBe(2);
  });

  it('falls back to a default name', () => {
    const p = new ProfileService(storage);
    expect(p.hasName).toBe(false);
    expect(p.name).toBe('Player');
    p.setName('Hero');
    expect(new ProfileService(storage).name).toBe('Hero');
  });
});

describe('WalletService', () => {
  it('commits run coins to the persistent balance', () => {
    const w = new WalletService(storage);
    w.startRun();
    w.add();
    w.add(2);
    expect(w.commitRun()).toBe(3);
    expect(new WalletService(storage).balance).toBe(3);
  });
});
