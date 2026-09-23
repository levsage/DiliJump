/** Lightweight pooled particle system for sparkles, dust and debris. */
export class ParticleSystem {
  constructor(max = 300) {
    this.max = max;
    this.items = [];
  }

  emit(
    x,
    y,
    {
      count = 10,
      color = '#fff',
      speed = 200,
      life = 0.6,
      size = 4,
      gravity = 600,
      spread = Math.PI * 2,
      angle = -Math.PI / 2,
    } = {},
  ) {
    for (let i = 0; i < count && this.items.length < this.max; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.items.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.6),
        color,
        gravity,
      });
    }
  }

  update(dt) {
    for (const p of this.items) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  clear() {
    this.items.length = 0;
  }
}
