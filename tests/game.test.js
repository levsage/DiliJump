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

function makeGame() {
  const storage = new Storage(new MemoryBackend(), 'test:');
  const audio = new Proxy({}, { get: () => () => {} }); // every sound is a no-op
  const game = new Game({
    events: new EventBus(),
    input: { reset() {}, enabled: false },
    renderer: {},
    audio,
    profile: new ProfileService(storage),
    wallet: new WalletService(storage),
    leaderboard: new LocalLeaderboard(storage),
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
});
