import { VIEW } from '../config/constants.js';
import { COLORS } from './palette.js';
import { drawLogo } from './brand.js';
import { Random } from '../utils/random.js';

/**
 * Parallax sky: gradient that darkens into space as you climb, drifting
 * clouds, twinkling stars and faint Dlicom logo "constellations".
 */
export class Background {
  constructor() {
    const rng = new Random(2024);
    this.stars = Array.from({ length: 90 }, () => ({
      x: rng.range(0, VIEW.WIDTH),
      y: rng.range(0, VIEW.HEIGHT * 2),
      r: rng.range(0.6, 2.2),
      tw: rng.range(0, Math.PI * 2),
    }));
    this.clouds = Array.from({ length: 7 }, () => ({
      x: rng.range(-60, VIEW.WIDTH),
      y: rng.range(0, VIEW.HEIGHT * 1.6),
      s: rng.range(0.6, 1.3),
      v: rng.range(6, 18),
    }));
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > VIEW.WIDTH + 120) c.x = -160;
    }
  }

  /** @param {number} altitude 0 at ground, grows as the player climbs. */
  draw(ctx, cameraY, altitude) {
    const space = Math.min(1, altitude / 25000);
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.HEIGHT);
    g.addColorStop(0, mix(COLORS.skyMid, COLORS.skyTop, 0.35 + space * 0.65));
    g.addColorStop(0.6, mix(COLORS.skyBottom, COLORS.skyMid, space));
    g.addColorStop(1, mix('#bfe3ff', COLORS.skyBottom, space));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);

    // Stars (slow parallax), more visible higher up.
    const starAlpha = 0.25 + space * 0.75;
    const span = VIEW.HEIGHT * 2;
    for (const s of this.stars) {
      const y = mod(s.y - cameraY * 0.05, span) - VIEW.HEIGHT * 0.5;
      if (y < -4 || y > VIEW.HEIGHT) continue;
      ctx.globalAlpha = starAlpha * (0.55 + 0.45 * Math.sin(this.time * 2 + s.tw));
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Giant faint logo far in the background.
    ctx.globalAlpha = 0.06;
    const ly = mod(-cameraY * 0.03 + 200, VIEW.HEIGHT + 400) - 200;
    drawLogo(ctx, VIEW.WIDTH / 2, ly, 360, '#ffffff');

    // Clouds (medium parallax), fade out into space.
    ctx.globalAlpha = 0.55 * (1 - space * 0.8);
    const cspan = VIEW.HEIGHT * 1.6;
    for (const c of this.clouds) {
      const y = mod(c.y - cameraY * 0.25, cspan) - 120;
      drawCloud(ctx, c.x, y, c.s);
    }
    ctx.globalAlpha = 1;
  }
}

const mod = (a, n) => ((a % n) + n) % n;

function drawCloud(ctx, x, y, s) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y - 12 * s, 32 * s, 0, Math.PI * 2);
  ctx.arc(x + 64 * s, y, 24 * s, 0, Math.PI * 2);
  ctx.arc(x + 32 * s, y + 10 * s, 26 * s, 0, Math.PI * 2);
  ctx.fill();
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}
