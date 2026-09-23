import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, MemoryBackend } from '../src/services/Storage.js';
import { LeaderboardService } from '../src/services/LeaderboardService.js';
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

describe('LeaderboardService', () => {
  it('keeps entries sorted and capped', () => {
    const lb = new LeaderboardService(storage, 3);
    [100, 500, 300, 50, 400].forEach((score, i) => lb.submit({ name: `p${i}`, score, date: i }));
    expect(lb.top().map((e) => e.score)).toEqual([500, 400, 300]);
  });

  it('returns the achieved rank or 0', () => {
    const lb = new LeaderboardService(storage, 2);
    expect(lb.submit({ name: 'a', score: 100 })).toBe(1);
    expect(lb.submit({ name: 'b', score: 200 })).toBe(1);
    expect(lb.submit({ name: 'c', score: 150 })).toBe(2);
    expect(lb.submit({ name: 'd', score: 10 })).toBe(0);
  });

  it('rejects zero scores', () => {
    const lb = new LeaderboardService(storage);
    expect(lb.submit({ name: 'a', score: 0 })).toBe(0);
  });

  it('persists across instances', () => {
    new LeaderboardService(storage).submit({ name: 'a', score: 42 });
    expect(new LeaderboardService(storage).top()[0].score).toBe(42);
  });

  it('breaks ties by coins', () => {
    const lb = new LeaderboardService(storage);
    lb.submit({ name: 'few', score: 100, coins: 1, date: 1 });
    lb.submit({ name: 'many', score: 100, coins: 9, date: 2 });
    expect(lb.top()[0].name).toBe('many');
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
