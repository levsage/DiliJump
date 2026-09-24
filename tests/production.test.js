import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameLoop, MAX_FRAME_ERRORS } from '../src/core/GameLoop.js';
import { AssetLoader } from '../src/core/AssetLoader.js';
import { CSP_HEADER, CSP_META } from '../tools/vite/csp.js';
import { PLAYER_POSES, ASSETS } from '../src/config/assets.js';

describe('Content Security Policy', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const header = vercel.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy');

  it('vercel.json header matches tools/vite/csp.js', () => {
    expect(header?.value).toBe(CSP_HEADER);
  });

  it('meta policy has no header-only directives and allows Supabase only', () => {
    expect(CSP_META).not.toContain('frame-ancestors');
    expect(CSP_META).toContain("script-src 'self'");
    expect(CSP_META).not.toContain('unsafe-eval');
    expect(CSP_META).toMatch(
      /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/,
    );
  });
});

describe('shipped sprites', () => {
  const meta = JSON.parse(
    readFileSync(new URL('../public/assets/sprites/sprites.json', import.meta.url), 'utf8'),
  );

  it('every pose the game loads exists as a WebP', () => {
    for (const pose of PLAYER_POSES) {
      expect(ASSETS.images[`player.${pose}`]).toMatch(/\.webp$/);
      const file = new URL(`../public/assets/sprites/${pose}.webp`, import.meta.url);
      expect(readFileSync(file).subarray(8, 12).toString()).toBe('WEBP');
      expect(meta.frames[pose].file).toBe(`${pose}.webp`);
    }
  });
});

describe('GameLoop resilience', () => {
  let frames;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (fn) => frames.push(fn));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = (loop, n) => {
    for (let i = 0; i < n && frames.length; i++) frames.shift()(loop.last + 1000 / 60);
  };

  it('keeps running after a failing frame', () => {
    let fail = true;
    let rendered = 0;
    const loop = new GameLoop({
      update: () => {
        if (fail) throw new Error('boom');
      },
      render: () => rendered++,
    });
    loop.start();
    run(loop, 3);
    fail = false;
    run(loop, 3);
    expect(loop.running).toBe(true);
    expect(rendered).toBeGreaterThan(0);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('reports a fatal error after persistent failures', () => {
    const onFatal = vi.fn();
    const loop = new GameLoop({
      update: () => {},
      render: () => {
        throw new Error('broken');
      },
      onFatal,
    });
    loop.start();
    run(loop, MAX_FRAME_ERRORS + 10);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(loop.running).toBe(false);
  });
});

describe('AssetLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries a flaky image before giving up', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    vi.stubGlobal(
      'Image',
      class {
        set src(_v) {
          attempts++;
          queueMicrotask(() => (attempts < 3 ? this.onerror() : this.onload()));
        }
      },
    );
    const loader = new AssetLoader();
    const p = loader.loadImage('x', 'x.webp');
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBeTruthy();
    expect(attempts).toBe(3);
  });
});
