import { VIEW, PLAYER, PLATFORM_TYPES } from '../config/constants.js';
import { COLORS } from './palette.js';
import { drawLogo } from './brand.js';
import { Background } from './Background.js';

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
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  cachePoses(poses) {
    for (const p of poses) this.poseImages[p] = this.assets.get(`player.${p}`);
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

  drawSpring(s) {
    const { ctx } = this;
    const h = s.h * (1 - s.compressed * 0.5) + (s.compressed > 0.5 ? 0 : s.compressed * 10);
    const x = s.x;
    const yb = s.platform.y;
    ctx.save();
    ctx.globalAlpha = s.platform.fade;
    ctx.strokeStyle = '#c7d2e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const coils = 4;
    for (let i = 0; i <= coils * 2; i++) {
      const px = x + (i % 2 ? s.w - 4 : 4);
      const py = yb - (i / (coils * 2)) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.danger;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 2, yb - h - 6, s.w + 4, 7, 3);
    ctx.fill();
    ctx.stroke();
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

  drawPlayer(pl) {
    const img = this.poseImages[pl.pose] ?? this.poseImages.idle;
    if (!img) return;
    drawSprite(this.ctx, img, pl.x, pl.y, PLAYER.DRAW_HEIGHT, {
      facing: pl.facing,
      scaleX: pl.scaleX,
      scaleY: pl.scaleY,
      rotation: pl.tilt + pl.spin,
    });
    // wrap-around ghost so the mascot is visible on both edges
    const half = (img.width / img.height) * PLAYER.DRAW_HEIGHT * 0.5;
    const ghostX =
      pl.x < half ? pl.x + VIEW.WIDTH : pl.x > VIEW.WIDTH - half ? pl.x - VIEW.WIDTH : null;
    if (ghostX !== null) {
      drawSprite(this.ctx, img, ghostX, pl.y, PLAYER.DRAW_HEIGHT, {
        facing: pl.facing,
        scaleX: pl.scaleX,
        scaleY: pl.scaleY,
        rotation: pl.tilt + pl.spin,
      });
    }
  }
}

/** Draw a bottom-centre anchored sprite with squash/stretch & rotation about its centre. */
export function drawSprite(
  ctx,
  img,
  x,
  y,
  height,
  { facing = 1, scaleX = 1, scaleY = 1, rotation = 0 } = {},
) {
  const w = (img.width / img.height) * height;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleX, scaleY);
  ctx.translate(0, -height / 2);
  ctx.rotate(rotation);
  ctx.scale(facing < 0 ? -1 : 1, 1);
  ctx.drawImage(img, -w / 2, -height / 2, w, height);
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
