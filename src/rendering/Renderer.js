import { VIEW, PLAYER, PLATFORM_TYPES, WALL } from '../config/constants.js';
import { COLORS } from './palette.js';
import { drawLogo } from './brand.js';
import { Background } from './Background.js';
import { springStretch } from '../entities/animation.js';

/**
 * Draws the world. Owns the canvas, handles DPR-aware resizing and keeps a
 * fixed logical resolution (VIEW.WIDTH × VIEW.HEIGHT), letter-boxed to fit.
 */
export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.background = new Background();
    this.poseImages = {};
    this.sheets = {};
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  cachePoses(poses) {
    for (const p of poses) this.poseImages[p] = this.assets.get(`player.${p}`);
  }

  /** Animation atlases: `{ name: { img, cell:[w,h], cols, refHeight } }`. */
  cacheSheets(meta) {
    for (const [name, m] of Object.entries(meta)) {
      const img = this.assets.get(`sheet.${name}`);
      if (img) this.sheets[name] = { ...m, img };
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, VIEW.MAX_DPR);
    this.canvas.width = Math.round(VIEW.WIDTH * dpr);
    this.canvas.height = Math.round(VIEW.HEIGHT * dpr);
    this.scale = dpr;
  }

  begin() {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  render(world, camera, dt) {
    const { ctx } = this;
    this.begin();
    this.background.update(dt);
    this.background.draw(ctx, camera.y, world.altitude);

    ctx.save();
    ctx.translate(camera.offsetX, -camera.y + camera.offsetY);
    const top = camera.y - 80;
    const bottom = camera.y + VIEW.HEIGHT + 80;
    const visible = (y) => y > top && y < bottom;

    for (const p of world.platforms) if (visible(p.y)) this.drawPlatform(p);
    for (const s of world.springs) if (visible(s.y)) this.drawSpring(s);
    for (const c of world.coins) if (visible(c.y)) this.drawCoin(c);
    for (const m of world.monsters) if (visible(m.y)) this.drawMonster(m);
    for (const b of world.projectiles) this.drawProjectile(b);
    this.drawParticles(world.particles.items);
    if (world.player) this.drawPlayer(world.player);
    ctx.restore();

    // side walls in front of everything, so gloves/cape tuck behind them
    this.drawWalls(camera, world.wallFlash);
  }

  /**
   * Solid side walls: navy glass pillars with a glowing inner edge and Dlicom
   * diamonds anchored to the world, so they scroll past as you climb.
   */
  drawWalls(camera, flash) {
    const { ctx } = this;
    const W = WALL.WIDTH;
    const H = VIEW.HEIGHT;
    ctx.save();
    ctx.translate(camera.offsetX, 0);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : VIEW.WIDTH - W; // outer edge of this wall
      const inner = side < 0 ? W : VIEW.WIDTH - W; // edge facing the playfield

      // body
      const body = ctx.createLinearGradient(x0, 0, x0 + W, 0);
      const dark = 'rgba(8, 22, 60, 0.94)';
      const mid = 'rgba(22, 52, 128, 0.94)';
      body.addColorStop(0, side < 0 ? dark : mid);
      body.addColorStop(1, side < 0 ? mid : dark);
      ctx.fillStyle = body;
      ctx.fillRect(x0 - 40 * (side < 0 ? 1 : 0), 0, W + 40, H); // overscan for camera shake

      // world-anchored diamonds (the visor's Dlicom diamond)
      const step = 72;
      const cx = x0 + W / 2;
      const first = Math.floor(camera.y / step) * step;
      ctx.strokeStyle = 'rgba(127, 212, 255, 0.45)';
      ctx.lineWidth = 1.5;
      for (let wy = first; wy < camera.y + H + step; wy += step) {
        const y = wy - camera.y;
        ctx.beginPath();
        ctx.moveTo(cx, y - 5);
        ctx.lineTo(cx + 4, y);
        ctx.lineTo(cx, y + 5);
        ctx.lineTo(cx - 4, y);
        ctx.closePath();
        ctx.stroke();
      }

      // inner glow + bright edge line
      const glow = ctx.createLinearGradient(inner, 0, inner - side * 10, 0);
      glow.addColorStop(0, 'rgba(95, 243, 255, 0.28)');
      glow.addColorStop(1, 'rgba(95, 243, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(Math.min(inner, inner - side * 10), 0, 10, H);
      ctx.fillStyle = 'rgba(160, 230, 255, 0.9)';
      ctx.fillRect(inner - (side < 0 ? 2 : 0), 0, 2, H);

      // bump flash where the mascot hit the wall
      if (flash && flash.side === side) {
        const k = flash.t / WALL.FLASH_TIME;
        const y = flash.y - camera.y;
        const g = ctx.createRadialGradient(inner, y, 0, inner, y, 70);
        g.addColorStop(0, `rgba(95, 243, 255, ${0.75 * k})`);
        g.addColorStop(1, 'rgba(95, 243, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(inner - 70, y - 70, 140, 140);
      }
    }
    ctx.restore();
  }

  drawPlatform(p) {
    const { ctx } = this;
    const [light, dark] = COLORS.platform[p.type];
    const squish = Math.sin(p.bounceAnim * Math.PI) * 4;
    ctx.save();
    ctx.globalAlpha = p.fade;
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2 + squish);
    ctx.rotate(p.broken ? p.rot * 0.3 : 0);

    if (p.type === PLATFORM_TYPES.BREAKING && p.broken) {
      // two halves drifting apart
      const gap = 10 + p.rot * 30;
      this.pill(-p.w / 4 - gap / 2, 0, p.w / 2, p.h, light, dark, -p.rot * 0.4);
      this.pill(p.w / 4 + gap / 2, 0, p.w / 2, p.h, light, dark, p.rot * 0.4);
    } else {
      this.pill(0, 0, p.w, p.h, light, dark, 0);
      if (p.type === PLATFORM_TYPES.BREAKING) {
        ctx.strokeStyle = 'rgba(60,35,15,.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -p.h / 2 + 2);
        ctx.lineTo(2, -1);
        ctx.lineTo(-3, 3);
        ctx.lineTo(4, p.h / 2 - 2);
        ctx.stroke();
      }
      if (p.type === PLATFORM_TYPES.MOVING) {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        for (const dx of [-p.w / 2 + 12, p.w / 2 - 12]) {
          const d = Math.sign(dx);
          ctx.beginPath();
          ctx.moveTo(dx + d * 4, 0);
          ctx.lineTo(dx - d * 3, -4);
          ctx.lineTo(dx - d * 3, 4);
          ctx.fill();
        }
      }
      if (p.type === PLATFORM_TYPES.VANISHING) {
        ctx.globalAlpha = p.fade * 0.6;
        drawLogo(ctx, 0, 0, 22, '#7d95c9');
      }
    }
    ctx.restore();
  }

  pill(cx, cy, w, h, light, dark, rot) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 8, -h / 2 + 3, w - 16, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Spring pad: a metal coil with a red top plate. When hit it squashes, then
   * "boings" up past its rest height and wobbles back, with a shock ring.
   */
  drawSpring(s) {
    const { ctx } = this;
    const stretch = springStretch(s.t);
    const idle = s.t < 0 ? Math.sin(s.idle * 4) * 0.06 : 0; // subtle "ready" bob
    const h = s.h * (1 + stretch + idle);
    const cx = s.x + s.w / 2;
    const yb = s.platform.y;
    const coilW = s.w * (1 - stretch * 0.18);

    ctx.save();
    ctx.globalAlpha = s.platform.fade;

    // shock ring when triggered
    if (s.t >= 0 && s.t < 0.35) {
      const k = s.t / 0.35;
      ctx.strokeStyle = `rgba(95,243,255,${(1 - k) * 0.9})`;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(cx, yb - 2, 14 + k * 46, 4 + k * 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // coil: back half darker, front half bright, for a 3D helix look
    const turns = 4;
    const steps = turns * 16;
    for (const front of [false, true]) {
      ctx.strokeStyle = front ? '#e8eefc' : '#7f8db0';
      ctx.lineWidth = front ? 3 : 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let drawing = false;
      for (let i = 0; i <= steps; i++) {
        const a = (i / 16) * Math.PI * 2;
        const isFront = Math.cos(a) > 0;
        const px = cx + Math.sin(a) * (coilW / 2 - 3);
        const py = yb - (i / steps) * h;
        if (isFront === front) {
          if (!drawing) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
          drawing = true;
        } else drawing = false;
      }
      ctx.stroke();
    }

    // base + top plate
    ctx.fillStyle = '#56607a';
    ctx.beginPath();
    ctx.roundRect(cx - s.w / 2 + 2, yb - 3, s.w - 4, 4, 2);
    ctx.fill();
    const plateW = s.w + 6 + Math.max(0, -stretch) * 10;
    const g = ctx.createLinearGradient(0, yb - h - 7, 0, yb - h);
    g.addColorStop(0, '#ff8a9f');
    g.addColorStop(1, COLORS.danger);
    ctx.fillStyle = g;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - plateW / 2, yb - h - 7, plateW, 7, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(cx - plateW / 2 + 4, yb - h - 5.5, plateW - 8, 1.5);
    ctx.restore();
  }

  /** DLI coin: gold disc with the Dlicom logo, spinning on its Y axis. */
  drawCoin(c) {
    const { ctx } = this;
    const spin = Math.cos(c.phase * 0.8);
    const sx = Math.max(0.12, Math.abs(spin));
    const alpha = c.collected ? 1 - c.collectT : 1;
    const scale = c.collected ? 1 + c.collectT * 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(c.x, c.bobY);
    ctx.scale(sx * scale, scale);
    // glow
    ctx.fillStyle = 'rgba(255,215,64,.25)';
    ctx.beginPath();
    ctx.arc(0, 0, c.r + 6, 0, Math.PI * 2);
    ctx.fill();
    drawCoinFace(ctx, c.r, spin < 0);
    ctx.restore();
  }

  drawMonster(m) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(m.x, m.y);
    if (!m.alive) {
      ctx.rotate(m.deathT * 6);
      ctx.globalAlpha = Math.max(0, 1 - m.deathT);
    }
    const wob = Math.sin(m.t * 10) * 0.08;
    ctx.scale(1 + wob, 1 - wob);
    const w = m.w;
    const h = m.h;
    // wings
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    const flap = Math.sin(m.t * 30) * 6;
    ctx.beginPath();
    ctx.ellipse(-w * 0.42, -h * 0.25 + flap, 14, 8, -0.5, 0, Math.PI * 2);
    ctx.ellipse(w * 0.42, -h * 0.25 + flap, 14, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // body
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#ff7a93');
    g.addColorStop(1, '#c21e4a');
    ctx.fillStyle = g;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 6, -h / 2, w - 12, h, 18);
    ctx.fill();
    ctx.stroke();
    // antennae
    ctx.beginPath();
    ctx.moveTo(-10, -h / 2);
    ctx.lineTo(-16, -h / 2 - 12);
    ctx.moveTo(10, -h / 2);
    ctx.lineTo(16, -h / 2 - 12);
    ctx.stroke();
    // angry eyes (diamond, mirroring the mascot's style)
    for (const d of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(d * 11, -4, 9, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(d * 11, -9);
      ctx.lineTo(d * 11 + 5, -3);
      ctx.lineTo(d * 11, 3);
      ctx.lineTo(d * 11 - 5, -3);
      ctx.fill();
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(d * 3, -14);
      ctx.lineTo(d * 19, -18);
      ctx.stroke();
    }
    // teeth
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    for (let i = 0; i < 5; i++) ctx.lineTo(-10 + i * 5 + 2.5, i % 2 ? 10 : 16);
    ctx.lineTo(10, 10);
    ctx.fill();
    ctx.restore();
  }

  drawProjectile(b) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, COLORS.energy);
    g.addColorStop(1, 'rgba(95,243,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(95,243,255,.35)';
    ctx.fillRect(b.x - 2, b.y, 4, 26);
  }

  drawParticles(items) {
    const { ctx } = this;
    for (const p of items) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Source image + rect for the player's current frame (sheet frame or single pose). */
  playerSprite(pl, frame = pl.frame) {
    const sheet = frame && this.sheets[frame.sheet];
    if (sheet) {
      const [cw, ch] = sheet.cell;
      return {
        img: sheet.img,
        sx: (frame.index % sheet.cols) * cw,
        sy: Math.floor(frame.index / sheet.cols) * ch,
        sw: cw,
        sh: ch,
        pxScale: PLAYER.DRAW_HEIGHT / sheet.refHeight,
      };
    }
    const img = this.poseImages[pl.pose] ?? this.poseImages.idle;
    if (!img) return null;
    return {
      img,
      sx: 0,
      sy: 0,
      sw: img.width,
      sh: img.height,
      pxScale: PLAYER.DRAW_HEIGHT / img.height,
    };
  }

  drawPlayer(pl) {
    const { ctx } = this;
    // spring super-jump afterimages (oldest first, fading)
    pl.trail.forEach((t, i) => {
      const spr = this.playerSprite(pl, t.frame);
      if (!spr) return;
      ctx.save();
      ctx.globalAlpha = 0.32 * (1 - (i + 1) / (pl.trail.length + 1));
      drawFrame(ctx, spr, t.x, t.y, { facing: pl.facing, rotation: t.rotation });
      ctx.restore();
    });

    const spr = this.playerSprite(pl);
    if (!spr) return;
    const opts = {
      facing: pl.facing,
      scaleX: pl.scaleX,
      scaleY: pl.scaleY,
      rotation: pl.tilt + pl.spin,
    };
    drawFrame(ctx, spr, pl.x, pl.y, opts);
  }
}

/**
 * Draw a bottom-centre anchored frame with squash/stretch & rotation. The
 * pivot is the body centre (half the draw height above the feet) so every
 * frame rotates around the same point, whatever its cell size.
 */
export function drawFrame(
  ctx,
  { img, sx, sy, sw, sh, pxScale },
  x,
  y,
  { facing = 1, scaleX = 1, scaleY = 1, rotation = 0 } = {},
) {
  const w = sw * pxScale;
  const h = sh * pxScale;
  const pivot = PLAYER.DRAW_HEIGHT / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleX, scaleY);
  ctx.translate(0, -pivot);
  ctx.rotate(rotation);
  ctx.scale(facing < 0 ? -1 : 1, 1);
  ctx.drawImage(img, sx, sy, sw, sh, -w / 2, pivot - h, w, h);
  ctx.restore();
}

/** Coin face drawn at the origin (shared with UI icons). */
export function drawCoinFace(ctx, r, back = false) {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, COLORS.coinLight);
  g.addColorStop(0.5, COLORS.coin);
  g.addColorStop(1, '#e09200');
  ctx.fillStyle = '#b86e00';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (back) ctx.scale(-1, 1);
  drawLogo(ctx, 0, 0, r * 1.25, '#1d4fa8');
  ctx.restore();
}
