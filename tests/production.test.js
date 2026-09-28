import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GameLoop, MAX_FRAME_ERRORS } from '../src/core/GameLoop.js';
import { AssetLoader } from '../src/core/AssetLoader.js';
import { CSP_HEADER, CSP_META } from '../tools/vite/csp.js';
import { SKINS, SKIN_POSES, skinManifest } from '../src/config/skins.js';

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

const sprite = (file) => readFileSync(new URL(`../public/assets/sprites/${file}`, import.meta.url));

describe('shipped sprites (every skin)', () => {
  const meta = JSON.parse(sprite('sprites.json').toString());

  it('the classic poses match sprites.json', () => {
    for (const pose of SKIN_POSES) expect(meta.frames[pose].file).toBe(`${pose}.webp`);
  });

  for (const skin of SKINS) {
    it(`${skin.id}: every pose, atlas and the avatar exist as WebP`, () => {
      expect(Object.keys(skin.art.poses).sort()).toEqual([...SKIN_POSES].sort());
      expect(Object.keys(skin.art.sheets).sort()).toEqual(['jump', 'spring']);
      const files = [
        ...Object.values(skin.art.poses).map((p) => p.file),
        ...Object.values(skin.art.sheets).map((s) => s.file),
        skin.art.avatar,
      ];
      for (const f of files) expect(sprite(f).subarray(8, 12).toString(), f).toBe('WEBP');
      expect(Object.keys(skinManifest(skin.id).images)).toHaveLength(files.length);
    });

    it(`${skin.id}: atlases hold every frame the animations use`, () => {
      expect(skin.art.sheets.jump.count).toBe(3);
      expect(skin.art.sheets.spring.count).toBe(8);
      for (const s of Object.values(skin.art.sheets)) {
        expect(s.refHeight).toBeGreaterThan(0);
        expect(s.cols * Math.ceil(s.count / s.cols)).toBeGreaterThanOrEqual(s.count);
      }
    });
  }
});

describe('sprite cache-busting', () => {
  it('generated file names carry the hash of their content', () => {
    const hashed = SKINS.flatMap((s) => [
      ...Object.values(s.art.sheets).map((x) => x.file),
      ...(s.id === 'classic' ? [] : Object.values(s.art.poses).map((x) => x.file)),
      s.art.avatar,
    ]);
    expect(hashed.length).toBeGreaterThan(10);
    for (const file of hashed) {
      const m = file.match(/\.([0-9a-f]{8})\.webp$/);
      expect(m, file).not.toBeNull();
      expect(createHash('sha256').update(sprite(file)).digest('hex').slice(0, 8)).toBe(m[1]);
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

  it('loads each key once, even when requested twice at the same time', async () => {
    let requests = 0;
    vi.stubGlobal(
      'Image',
      class {
        set src(_v) {
          requests++;
          queueMicrotask(() => this.onload());
        }
      },
    );
    const loader = new AssetLoader();
    const manifest = { images: { a: 'a.webp', b: 'b.webp' } };
    await Promise.all([loader.loadAll(manifest), loader.loadAll(manifest)]);
    await loader.loadAll({ images: { a: 'a.webp' } });
    expect(requests).toBe(2);
    expect(loader.has('a') && loader.has('b')).toBe(true);
  });
});
