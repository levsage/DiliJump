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

  it('adds every run to the lifetime XP (player level)', () => {
    const p = new ProfileService(storage);
    p.recordRun(800);
    p.recordRun(300);
    expect(p.totalScore).toBe(1100);
    expect(p.level).toBe(2);
    expect(p.levelProgress).toMatchObject({ into: 100, needed: 1500 });
    expect(new ProfileService(storage).totalScore).toBe(1100); // persisted
  });

  it('starts pre-v3.0 profiles from their best and adopts a higher server total', () => {
    storage.set('profile', { name: 'Old', bestScore: 900, gamesPlayed: 12 });
    const p = new ProfileService(storage);
    expect(p.totalScore).toBe(900);
    expect(p.syncTotal(5000)).toBe(true);
    expect(p.level).toBe(4);
    expect(p.syncTotal(1000)).toBe(false); // never lowers
    expect(p.syncTotal(undefined)).toBe(false);
    expect(new ProfileService(storage).totalScore).toBe(5000);
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
