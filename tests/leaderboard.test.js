import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Storage, MemoryBackend } from '../src/services/Storage.js';
import { LocalLeaderboard } from '../src/services/leaderboard/LocalLeaderboard.js';
import { SupabaseLeaderboard } from '../src/services/leaderboard/SupabaseLeaderboard.js';
import { PlayerIdentity } from '../src/services/PlayerIdentity.js';

let storage;
beforeEach(() => {
  storage = new Storage(new MemoryBackend(), 'test:');
});

describe('LocalLeaderboard — one best entry per person', () => {
  it('keeps only the highest score per player', async () => {
    const lb = new LocalLeaderboard(storage);
    await lb.submit({ name: 'Alice', score: 500, date: 1 });
    const worse = await lb.submit({ name: 'Alice', score: 300, date: 2 });
    await lb.submit({ name: 'Bob', score: 400, date: 3 });

    expect(worse.isBest).toBe(false);
    expect(worse.bestScore).toBe(500);
    const top = await lb.top();
    expect(top.map((e) => `${e.name}:${e.score}`)).toEqual(['Alice:500', 'Bob:400']);
  });

  it('replaces the entry when the player beats their best', async () => {
    const lb = new LocalLeaderboard(storage);
    await lb.submit({ name: 'Bob', score: 400, date: 1 });
    await lb.submit({ name: 'Alice', score: 500, date: 2 });
    const res = await lb.submit({ name: 'bob', score: 900, date: 3 }); // case-insensitive
    expect(res).toMatchObject({ isBest: true, rank: 1, bestScore: 900 });
    expect((await lb.top()).length).toBe(2);
  });

  it('breaks ties by who reached the score first', async () => {
    const lb = new LocalLeaderboard(storage);
    await lb.submit({ name: 'Late', score: 100, date: 20 });
    await lb.submit({ name: 'Early', score: 100, date: 10 });
    expect((await lb.top())[0].name).toBe('Early');
  });

  it('migrates legacy v1.0.0 data (many runs per person) to one per person', async () => {
    storage.set('leaderboard', [
      { name: 'Alice', score: 100, date: 1 },
      { name: 'Alice', score: 700, date: 2 },
      { name: 'Bob', score: 300, date: 3 },
    ]);
    const lb = new LocalLeaderboard(storage);
    expect((await lb.top()).map((e) => e.score)).toEqual([700, 300]);
  });

  it('marks the current player and returns their entry', async () => {
    const lb = new LocalLeaderboard(storage);
    await lb.submit({ name: 'Alice', score: 500 });
    lb.setCurrentName('Alice');
    expect((await lb.top())[0].isMe).toBe(true);
    expect((await lb.myEntry()).rank).toBe(1);
  });

  it('rename moves the entry to the new name', async () => {
    const lb = new LocalLeaderboard(storage);
    await lb.submit({ name: 'Old', score: 50 });
    await lb.rename('Old', 'New');
    expect((await lb.top())[0].name).toBe('New');
  });

  it('adds every run to the lifetime XP and level', async () => {
    const lb = new LocalLeaderboard(storage);
    await lb.submit({ name: 'Alice', score: 800, date: 1 });
    const res = await lb.submit({ name: 'Alice', score: 300, date: 2 }); // not a best
    expect(res).toMatchObject({ isBest: false, totalScore: 1100, level: 2, prevLevel: 1 });
    await lb.submit({ name: 'alice', score: 1500, date: 3 }); // new best keeps the XP
    const [top] = await lb.top();
    expect(top).toMatchObject({ score: 1500, totalScore: 2600, level: 3 });
  });

  it('counts the best score as XP for entries from before v3.0', async () => {
    storage.set('leaderboard', [{ id: 'l', name: 'Old', score: 1200, coins: 0, date: 1 }]);
    const lb = new LocalLeaderboard(storage);
    expect((await lb.top())[0]).toMatchObject({ totalScore: 1200, level: 2 });
    expect((await lb.submit({ name: 'Old', score: 100 })).totalScore).toBe(1300);
  });

  it('ignores zero scores', async () => {
    const lb = new LocalLeaderboard(storage);
    expect((await lb.submit({ name: 'A', score: 0 })).rank).toBe(0);
  });
});

/** Minimal fake of the parts of supabase-js we use (no auth!). */
function fakeClient({ rpcImpl } = {}) {
  return {
    auth: { signInAnonymously: vi.fn(), getSession: vi.fn() },
    rpc: vi.fn(rpcImpl ?? (async () => ({ data: [], error: null }))),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  };
}

const makeLb = (client, extra = {}) =>
  new SupabaseLeaderboard({
    getClient: async () => client,
    storage,
    identity: new PlayerIdentity(storage),
    ...extra,
  });

describe('PlayerIdentity (browser-only, no login)', () => {
  it('creates a UUID + secret once and keeps it', () => {
    const a = new PlayerIdentity(storage).get();
    expect(a.playerId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.secret.length).toBeGreaterThanOrEqual(32);
    expect(new PlayerIdentity(storage).get()).toEqual(a);
  });

  it('replaces corrupt stored identities', () => {
    storage.set('identity', { playerId: 'nope', secret: 'x' });
    expect(PlayerIdentity.isValid(new PlayerIdentity(storage).get())).toBe(true);
  });
});

describe('SupabaseLeaderboard (database only, no login)', () => {
  it('never uses Supabase Auth', async () => {
    const client = fakeClient();
    const lb = makeLb(client);
    await lb.top();
    await lb.submit({ name: 'A', score: 1 });
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('submits through submit_score with the browser identity', async () => {
    const client = fakeClient({
      rpcImpl: async () => ({ data: [{ best_score: 900, is_best: true, rank: 3 }], error: null }),
    });
    const lb = makeLb(client);
    const { playerId, secret } = new PlayerIdentity(storage).get();

    const res = await lb.submit({
      name: 'Alice',
      score: 900,
      coins: 4,
      height: 5000,
      durationMs: 61234.7,
    });

    expect(client.rpc).toHaveBeenCalledWith('submit_score', {
      p_player_id: playerId,
      p_secret: secret,
      p_name: 'Alice',
      p_score: 900,
      p_coins: 4,
      p_height: 5000,
      p_duration_ms: 61235,
    });
    // database from before v3.0: no level columns → nulls, nothing breaks
    expect(res).toEqual({
      rank: 3,
      isBest: true,
      bestScore: 900,
      totalScore: null,
      level: null,
      prevLevel: null,
      online: true,
    });
  });

  it('returns lifetime XP and level from submit_score (v3.0 database)', async () => {
    const client = fakeClient({
      rpcImpl: async () => ({
        data: [
          {
            best_score: 900,
            is_best: false,
            rank: 3,
            total_score: '2600',
            level: 3,
            prev_level: 2,
          },
        ],
        error: null,
      }),
    });
    const res = await makeLb(client).submit({ name: 'Alice', score: 200 });
    expect(res).toMatchObject({ totalScore: 2600, level: 3, prevLevel: 2 });
  });

  it('maps level + total XP onto leaderboard rows (and tolerates their absence)', () => {
    const base = { rank: 1, player_id: 'x', name: 'A', best_score: 5, best_at: null };
    expect(
      SupabaseLeaderboard.mapRow({ ...base, total_score: 7000, level: 5 }, 'me'),
    ).toMatchObject({ level: 5, totalScore: 7000 });
    // total without level → computed with the same formula
    expect(SupabaseLeaderboard.mapRow({ ...base, total_score: 2500 }, 'me').level).toBe(3);
    expect(SupabaseLeaderboard.mapRow(base, 'me')).toMatchObject({ level: null, totalScore: null });
  });

  it('maps leaderboard rows and flags the current player', async () => {
    const me = new PlayerIdentity(storage).get().playerId;
    const client = fakeClient({
      rpcImpl: async () => ({
        data: [
          {
            rank: 1,
            player_id: 'x',
            name: 'Top',
            best_score: 999,
            best_coins: 9,
            best_height: 1,
            best_at: '2026-09-23T00:00:00Z',
          },
          {
            rank: 2,
            player_id: me,
            name: 'Me',
            best_score: 500,
            best_coins: 2,
            best_height: 1,
            best_at: '2026-09-23T00:00:00Z',
          },
        ],
        error: null,
      }),
    });
    const top = await makeLb(client).top(10);
    expect(client.rpc).toHaveBeenCalledWith('get_leaderboard', { p_limit: 10 });
    expect(top.map((e) => [e.rank, e.name, e.score, e.isMe])).toEqual([
      [1, 'Top', 999, false],
      [2, 'Me', 500, true],
    ]);
  });

  it('looks up the own rank by player id', async () => {
    const client = fakeClient();
    const lb = makeLb(client);
    await lb.myEntry();
    expect(client.rpc).toHaveBeenCalledWith('get_player_rank', { p_player_id: lb.playerId });
  });

  it('does not call rename_player before the first accepted run', async () => {
    const client = fakeClient();
    await makeLb(client).rename('Old', 'New');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('remembers registration after the first accepted run', async () => {
    const client = fakeClient({
      rpcImpl: async () => ({ data: [{ best_score: 5, is_best: true, rank: 1 }], error: null }),
    });
    await makeLb(client).submit({ name: 'A', score: 5 });
    expect(new PlayerIdentity(storage).registered).toBe(true);
  });

  it('renames with credentials once registered', async () => {
    const client = fakeClient({ rpcImpl: async () => ({ data: 'New', error: null }) });
    new PlayerIdentity(storage).markRegistered();
    const lb = makeLb(client);
    await lb.rename('Old', 'New');
    expect(client.rpc).toHaveBeenCalledWith(
      'rename_player',
      expect.objectContaining({ p_name: 'New', p_player_id: lb.playerId }),
    );
  });

  it('queues every unsent run while offline (each adds XP) and flushes them one by one', async () => {
    vi.useFakeTimers();
    try {
      let online = false;
      const client = fakeClient({
        rpcImpl: async (fn, args) =>
          online
            ? { data: [{ best_score: args.p_score, is_best: true, rank: 1 }], error: null }
            : { data: null, error: { message: 'Failed to fetch' } },
      });
      const lb = makeLb(client);
      lb.scheduleRetry = () => {};

      expect((await lb.submit({ name: 'A', score: 300 })).queued).toBe(true);
      await lb.submit({ name: 'A', score: 100 });
      expect(storage.get('leaderboard:pending').map((r) => r.score)).toEqual([300, 100]);

      online = true;
      await lb.flushPending();
      expect(client.rpc).toHaveBeenLastCalledWith(
        'submit_score',
        expect.objectContaining({ p_score: 300 }),
      );
      expect(storage.get('leaderboard:pending').map((r) => r.score)).toEqual([100]);

      // the next one waits for the database's 3 s rate limit
      await vi.advanceTimersByTimeAsync(3400);
      expect(client.rpc).toHaveBeenLastCalledWith(
        'submit_score',
        expect.objectContaining({ p_score: 100 }),
      );
      expect(storage.get('leaderboard:pending')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('migrates the pre-v3.0 single pending run and caps the queue', async () => {
    storage.set('leaderboard:pending', { name: 'A', score: 50 });
    const lb = makeLb(fakeClient());
    lb.scheduleRetry = () => {};
    expect(lb.pending().map((r) => r.score)).toEqual([50]);
    for (let i = 1; i <= 40; i++) lb.queue({ name: 'A', score: i * 10 });
    const scores = lb.pending().map((r) => r.score);
    expect(scores).toHaveLength(30);
    expect(Math.min(...scores)).toBe(110); // smallest runs dropped first
    expect(scores).toEqual([...scores].sort((x, y) => x - y)); // order preserved
  });

  it('does not retry runs the database rejected', async () => {
    const client = fakeClient({
      rpcImpl: async () => ({ data: null, error: { code: '22023', message: 'Implausible score' } }),
    });
    const lb = makeLb(client);
    const res = await lb.submit({ name: 'A', score: 1e9 });
    expect(res.queued).toBe(false);
    expect(storage.get('leaderboard:pending')).toBeNull();
  });
});
