import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { GAME_STATES } from '../src/config/constants.js';
import { EventBus } from '../src/core/EventBus.js';
import { Storage, MemoryBackend } from '../src/services/Storage.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { WalletService } from '../src/services/WalletService.js';
import { LocalLeaderboard } from '../src/services/leaderboard/LocalLeaderboard.js';

let Game;
beforeAll(async () => {
  // Game listens for tab visibility; the unit tests run without a DOM
  globalThis.document ??= { hidden: false, addEventListener() {} };
  ({ Game } = await import('../src/core/Game.js'));
});
afterEach(() => vi.useRealTimers());

function makeGame({ leaderboard } = {}) {
  const storage = new Storage(new MemoryBackend(), 'test:');
  const audio = new Proxy({}, { get: () => () => {} }); // every sound is a no-op
  const game = new Game({
    events: new EventBus(),
    input: { reset() {}, enabled: false },
    renderer: {},
    audio,
    profile: new ProfileService(storage),
    wallet: new WalletService(storage),
    leaderboard: leaderboard ?? new LocalLeaderboard(storage),
  });
  game.profile.setName('Tester');
  return game;
}

describe('Game run end (death → game over)', () => {
  it('shows game over after the short death animation', () => {
    vi.useFakeTimers();
    const game = makeGame();
    game.start();
    game.finishRun();
    expect(game.state).toBe(GAME_STATES.PLAYING);
    vi.advanceTimersByTime(700);
    expect(game.state).toBe(GAME_STATES.GAME_OVER);
  });

  it('cannot be paused while dying, and finishes only once', () => {
    vi.useFakeTimers();
    const game = makeGame();
    game.start();
    game.finishRun();
    game.finishRun();
    game.pause();
    expect(game.state).toBe(GAME_STATES.PLAYING);
    vi.advanceTimersByTime(700);
    expect(game.state).toBe(GAME_STATES.GAME_OVER);
    expect(game.profile.gamesPlayed).toBe(1);
  });

  it('a stale game over never interrupts the menu or a new run', () => {
    vi.useFakeTimers();
    const game = makeGame();
    game.start();
    game.finishRun();
    game.quitToMenu();
    vi.advanceTimersByTime(700);
    expect(game.state).toBe(GAME_STATES.MENU);

    game.start();
    game.finishRun();
    game.start(); // "play again" straight away
    vi.advanceTimersByTime(700);
    expect(game.state).toBe(GAME_STATES.PLAYING);
    game.pause(); // the new run is a normal run again
    expect(game.state).toBe(GAME_STATES.PAUSED);
  });

  it('adds the run score to the lifetime XP and reports level ups', async () => {
    vi.useFakeTimers();
    const game = makeGame();
    game.start();
    Object.defineProperty(game.world, 'totalScore', { get: () => 2600, configurable: true });
    game.finishRun();
    expect(game.lastResult).toMatchObject({ prevLevel: 1, level: 3, levelUp: true });
    await vi.runAllTimersAsync();
    expect(game.profile.totalScore).toBe(2600);
  });

  it('after a run, best + level follow the database (e.g. board reset mid-session)', async () => {
    vi.useFakeTimers();
    const server = {
      mode: 'online',
      unsyncedRuns: () => [],
      submit: async ({ score }) => ({
        rank: 1,
        isBest: true,
        bestScore: score,
        totalScore: score,
        level: 1,
        online: true,
      }),
    };
    const game = makeGame({ leaderboard: server });
    game.profile.recordRun(5000); // played before the admin reset the board
    game.start();
    Object.defineProperty(game.world, 'totalScore', { get: () => 157, configurable: true });
    game.finishRun();
    await vi.runAllTimersAsync();
    expect(game.profile.bestScore).toBe(157);
    expect(game.profile.totalScore).toBe(157);
    expect(game.lastResult).toMatchObject({ isBest: true, level: 1 });
  });

  it('offline: the local numbers stand until the database confirms', async () => {
    vi.useFakeTimers();
    const offline = {
      mode: 'online',
      unsyncedRuns: () => [{ score: 300 }],
      submit: async () => ({ rank: 0, isBest: false, bestScore: 300, online: false, queued: true }),
    };
    const game = makeGame({ leaderboard: offline });
    game.profile.recordRun(5000);
    game.start();
    Object.defineProperty(game.world, 'totalScore', { get: () => 300, configurable: true });
    game.finishRun();
    await vi.runAllTimersAsync();
    expect(game.profile.bestScore).toBe(5000);
    expect(game.profile.totalScore).toBe(5300);
  });
});
