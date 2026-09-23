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
    expect(res).toEqual({ rank: 3, isBest: true, bestScore: 900, online: true });
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

  it('renames with credentials', async () => {
    const client = fakeClient({ rpcImpl: async () => ({ data: 'New', error: null }) });
    const lb = makeLb(client);
    await lb.rename('Old', 'New');
    expect(client.rpc).toHaveBeenCalledWith(
      'rename_player',
      expect.objectContaining({ p_name: 'New', p_player_id: lb.playerId }),
    );
  });

  it('queues the best unsent run when offline and flushes it later', async () => {
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
    expect(storage.get('leaderboard:pending').score).toBe(300);

    online = true;
    await lb.flushPending();
    expect(storage.get('leaderboard:pending')).toBeNull();
    expect(client.rpc).toHaveBeenLastCalledWith(
      'submit_score',
      expect.objectContaining({ p_score: 300 }),
    );
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
