import { VIEW, PHYSICS, SCORING, MONSTER, COIN, PLAYFIELD, WALL } from '../config/constants.js';
import { Player } from '../entities/Player.js';
import { Projectile } from '../entities/Projectile.js';
import { ParticleSystem } from '../entities/Particle.js';
import { LevelGenerator } from '../systems/LevelGenerator.js';
import { Camera } from '../systems/Camera.js';
import { aabbOverlap, circleRectOverlap, landsOn } from '../systems/Collision.js';
import { EVENTS } from './EventBus.js';
import { COLORS } from '../rendering/palette.js';

/**
 * Holds every entity of a run and advances the simulation.
 * Knows nothing about DOM/UI — communicates outward through the EventBus.
 */
export class World {
  constructor(events) {
    this.events = events;
    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.reset();
  }

  reset(seed = Date.now()) {
    this.platforms = [];
    this.coins = [];
    this.springs = [];
    this.monsters = [];
    this.projectiles = [];
    this.particles.clear();
    /** Wall glow after a bump: `{ side: -1 | 1, y, t }` (t counts down). */
    this.wallFlash = null;

    this.originY = 0;
    this.score = 0;
    this.bonus = 0;
    this.coinsCollected = 0;
    this.maxHeight = 0;
    this.elapsed = 0; // seconds of simulated play (pauses excluded)
    this.over = false;

    this.generator = new LevelGenerator(this, { seed });
    const startY = VIEW.HEIGHT - 60;
    this.originY = startY;
    const floor = this.generator.init(startY);
    this.player = new Player(floor.x + floor.w / 2, floor.y);
    this.player.vy = PHYSICS.JUMP_VELOCITY;
    this.camera.reset(0);
  }

  /** Altitude in points (used by background and HUD). */
  get altitude() {
    return this.maxHeight / SCORING.PIXELS_PER_POINT;
  }

  get totalScore() {
    return Math.floor(this.altitude) + this.bonus;
  }

  update(dt, input) {
    const { player, camera } = this;
    if (!this.over) this.elapsed += dt;
    const axis = player.alive ? input.axis : 0;

    if (player.alive && input.consumeShoot() && player.canShoot()) {
      player.shoot();
      this.projectiles.push(new Projectile(player.x, player.y - 90));
      this.events.emit(EVENTS.SHOOT);
    }

    player.update(dt, axis, PLAYFIELD);
    this.handleWallBump(dt);
    this.emitSpringSparkles(dt);

    for (const p of this.platforms) p.update(dt, PLAYFIELD);
    for (const s of this.springs) s.update(dt);
    for (const c of this.coins) c.update(dt);
    for (const m of this.monsters) m.update(dt, PLAYFIELD);
    for (const b of this.projectiles) b.update(dt, camera.y);
    this.particles.update(dt);

    if (player.alive) {
      this.handleLanding();
      this.handleCoins();
      this.handleMonsters();
      this.handleProjectiles();
    }

    // Score = best height reached.
    const height = this.originY - player.y;
    if (height > this.maxHeight) {
      this.maxHeight = height;
      this.events.emit(EVENTS.SCORE, this.totalScore);
    }

    // Camera only ever moves up; once hit, the mascot tumbles out of view.
    if (player.alive) camera.follow(player.y - 60);
    camera.update(dt);

    this.generator.generateUntil(camera.y - VIEW.HEIGHT, this.altitude);
    this.cull();

    // Fell (or tumbled after a hit) off the bottom of the screen → game over.
    if (!this.over && player.y - 110 > camera.bottom) {
      this.over = true;
      if (player.alive) player.kill();
      this.events.emit(EVENTS.GAME_OVER);
    }
  }

  /** Hard bump into a side wall: dust puff, wall glow and a soft thud. */
  handleWallBump(dt) {
    if (this.wallFlash) {
      this.wallFlash.t -= dt;
      if (this.wallFlash.t <= 0) this.wallFlash = null;
    }
    const side = this.player.wallBump;
    if (!side) return;
    const y = this.player.y - 46;
    const x = side < 0 ? PLAYFIELD.LEFT : PLAYFIELD.RIGHT;
    this.wallFlash = { side, y, t: WALL.FLASH_TIME };
    this.particles.emit(x, y, {
      count: 7,
      color: COLORS.energy,
      speed: 140,
      life: 0.35,
      size: 3,
      gravity: 300,
      angle: side < 0 ? 0 : Math.PI,
      spread: Math.PI * 0.7,
    });
    if (!this.over) this.events.emit(EVENTS.WALL_BUMP, side);
  }

  /** Energy sparkles streaming from the boots during a spring super-jump. */
  emitSpringSparkles(dt) {
    const { player } = this;
    this.sparkleTimer = (this.sparkleTimer ?? 0) - dt;
    if (!player.springBoost || player.vy > -500 || this.sparkleTimer > 0) return;
    this.sparkleTimer = 0.03;
    this.particles.emit(player.x + (Math.random() - 0.5) * 18, player.y - 6, {
      count: 2,
      color: Math.random() < 0.5 ? COLORS.energy : '#ffffff',
      speed: 90,
      life: 0.45,
      size: 3,
      gravity: 0,
      angle: Math.PI / 2,
      spread: 0.9,
    });
  }

  handleLanding() {
    const { player } = this;
    if (!player.isFalling) return;
    const feet = player.feet;

    for (const s of this.springs) {
      if (s.dead) continue;
      if (landsOn(feet, player.prevY, player.y, player.vy, { x: s.x, y: s.y, w: s.w })) {
        player.y = s.y;
        player.bounce(PHYSICS.SPRING_VELOCITY, { spring: true });
        s.trigger();
        this.particles.emit(player.x, player.y, { count: 14, color: COLORS.energy, speed: 260 });
        this.events.emit(EVENTS.SPRING);
        return;
      }
    }

    for (const p of this.platforms) {
      if (!p.solid) continue;
      if (!landsOn(feet, player.prevY, player.y, player.vy, p)) continue;

      if (p.type === 'breaking') {
        p.breakApart();
        this.particles.emit(p.x + p.w / 2, p.y, {
          count: 10,
          color: '#8a6440',
          speed: 160,
          gravity: 900,
        });
        this.events.emit(EVENTS.PLATFORM_BREAK);
        continue; // fall straight through
      }
      player.y = p.y;
      player.bounce(PHYSICS.JUMP_VELOCITY);
      p.onLand();
      this.particles.emit(player.x, p.y, {
        count: 6,
        color: '#ffffff',
        speed: 120,
        life: 0.35,
        size: 3,
        gravity: 200,
      });
      this.events.emit(EVENTS.JUMP);
      return;
    }
  }

  handleCoins() {
    const box = this.player.hitbox;
    for (const c of this.coins) {
      if (c.collected) continue;
      if (circleRectOverlap(c.x, c.bobY, c.r, box)) {
        c.collect();
        this.coinsCollected += 1;
        this.bonus += COIN.SCORE_BONUS;
        this.particles.emit(c.x, c.y, {
          count: 12,
          color: COLORS.coin,
          speed: 220,
          life: 0.5,
          size: 3,
        });
        this.events.emit(EVENTS.COIN, this.coinsCollected);
        this.events.emit(EVENTS.SCORE, this.totalScore);
      }
    }
  }

  handleMonsters() {
    const { player } = this;
    const box = player.hitbox;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const mb = m.hitbox;
      if (!aabbOverlap(box, mb)) continue;
      // Stomp: falling and feet near the monster's top.
      if (player.isFalling && player.prevY <= mb.y + 16) {
        m.kill();
        player.y = mb.y;
        player.bounce(PHYSICS.STOMP_VELOCITY);
        this.bonus += MONSTER.STOMP_SCORE;
        this.camera.shake(6, 0.2);
        this.particles.emit(m.x, m.y, { count: 18, color: COLORS.danger, speed: 280 });
        this.events.emit(EVENTS.MONSTER_KILL, { stomp: true });
        this.events.emit(EVENTS.SCORE, this.totalScore);
      } else if (!player.springBoost) {
        player.kill();
        this.camera.shake(12, 0.4);
        this.events.emit(EVENTS.PLAYER_HIT);
      }
      return;
    }
  }

  handleProjectiles() {
    for (const b of this.projectiles) {
      if (b.dead) continue;
      for (const m of this.monsters) {
        if (m.alive && circleRectOverlap(b.x, b.y, b.r, m.hitbox)) {
          m.kill();
          b.dead = true;
          this.bonus += MONSTER.SHOOT_SCORE;
          this.particles.emit(m.x, m.y, { count: 16, color: COLORS.energy, speed: 260 });
          this.events.emit(EVENTS.MONSTER_KILL, { stomp: false });
          this.events.emit(EVENTS.SCORE, this.totalScore);
          break;
        }
      }
    }
  }

  /** Drop everything that scrolled off below the view. */
  cull() {
    const limit = this.camera.bottom + 120;
    const keep = (e) => !e.dead && e.y < limit;
    this.platforms = this.platforms.filter(keep);
    this.coins = this.coins.filter(keep);
    this.springs = this.springs.filter((s) => !s.dead && s.platform.y < limit);
    this.monsters = this.monsters.filter((m) => !m.dead && m.y < limit + 200);
    this.projectiles = this.projectiles.filter((b) => !b.dead);
  }
}
