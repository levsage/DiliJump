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

  it('starts pre-v3.0 profiles from their best as XP', () => {
    storage.set('profile', { name: 'Old', bestScore: 900, gamesPlayed: 12 });
    expect(new ProfileService(storage).totalScore).toBe(900);
  });

  it('follows the database up — the run history counts', () => {
    storage.set('profile', { name: 'Old', bestScore: 900, gamesPlayed: 12 });
    const p = new ProfileService(storage);
    expect(p.syncWithServer({ bestScore: 900, totalScore: 5000 })).toBe(true);
    expect(p.level).toBe(4);
    expect(new ProfileService(storage).totalScore).toBe(5000);
  });

  it('follows the database down after a leaderboard reset', () => {
    const p = new ProfileService(storage);
    p.recordRun(5000);
    p.recordRun(3000);
    // reset: the player has no row any more
    expect(p.syncWithServer(ProfileService.statsFromEntry(null))).toBe(true);
    expect(p.bestScore).toBe(0);
    expect(p.totalScore).toBe(0);
    expect(p.level).toBe(1);
    expect(p.gamesPlayed).toBe(2); // device stats stay
    expect(new ProfileService(storage).bestScore).toBe(0); // persisted
    // first run after the reset
    expect(p.syncWithServer({ bestScore: 157, totalScore: 157 })).toBe(true);
    expect(p.bestScore).toBe(157);
    expect(p.syncWithServer({ bestScore: 157, totalScore: 157 })).toBe(false);
  });

  it('keeps runs the database has not received yet on top of its numbers', () => {
    const p = new ProfileService(storage);
    p.syncWithServer({ bestScore: 400, totalScore: 1000 }, [{ score: 700 }, { score: 200 }]);
    expect(p.bestScore).toBe(700); // unsent record survives
    expect(p.totalScore).toBe(1900);
  });

  it('keeps the local XP while the database does not track it (before the migration)', () => {
    const p = new ProfileService(storage);
    p.recordRun(2600);
    p.recordRun(900);
    expect(p.syncWithServer({ bestScore: 2600, totalScore: null })).toBe(false);
    expect(p.totalScore).toBe(3500);
  });

  it('…but a reset (best went down) resets that XP to the safe lower bound', () => {
    const p = new ProfileService(storage);
    p.recordRun(5445);
    p.recordRun(20000);
    p.syncWithServer({ bestScore: 157, totalScore: null }, [{ score: 40 }]);
    expect(p.bestScore).toBe(157);
    expect(p.totalScore).toBe(197); // server best + unsent runs
    expect(p.level).toBe(1);
  });

  it('maps leaderboard rows to server stats', () => {
    expect(ProfileService.statsFromEntry({ score: 10, totalScore: 99 })).toEqual({
      bestScore: 10,
      totalScore: 99,
    });
    expect(ProfileService.statsFromEntry(null)).toEqual({ bestScore: 0, totalScore: 0 });
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
