import { ANIMATION, PHYSICS, PLAYER } from '../config/constants.js';
import { clamp, damp } from '../utils/math.js';
import { jumpFrame, springFrame } from './animation.js';

/**
 * Mascot state + animation.
 *
 * Normal movement plays generated animation sheets (12-frame jump, 8-frame
 * spring super-jump, see ./animation.js). Single generated poses are used as
 * short overrides (shoot, cheer, hurt). Procedural squash/stretch, lean and
 * facing are layered on top.
 */
export const POSE = Object.freeze({
  IDLE: 'idle',
  SHOOT: 'shoot',
  HURT: 'hurt',
  CHEER: 'cheer',
});

export class Player {
  constructor(x, y) {
    this.reset(x, y);
  }

  reset(x, y) {
    /** Anchor = bottom-centre (feet). World Y grows downward. */
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.prevY = y;
    this.facing = 1;
    this.alive = true;
    this.pose = POSE.IDLE;
    this.poseTimer = 0;
    this.shootCooldown = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.tilt = 0;
    this.spin = 0;
    this.time = 0;
    this.springBoost = false;
    this.sinceBounce = 1;
    /** Current sheet frame `{ sheet, index }`, or null while a pose override shows. */
    this.frame = { sheet: 'jump', index: 8 };
    /** Afterimages during the spring super-jump: `[{ x, y, frame, rotation }]`. */
    this.trail = [];
    this.trailTimer = 0;
  }

  get hitbox() {
    return {
      x: this.x - PLAYER.HITBOX_WIDTH / 2,
      y: this.y - PLAYER.HITBOX_HEIGHT,
      w: PLAYER.HITBOX_WIDTH,
      h: PLAYER.HITBOX_HEIGHT,
    };
  }

  get feet() {
    return { left: this.x - PLAYER.FEET_WIDTH / 2, right: this.x + PLAYER.FEET_WIDTH / 2 };
  }

  get isFalling() {
    return this.vy > 0;
  }

  setPose(pose, duration = 0) {
    this.pose = pose;
    this.poseTimer = duration;
  }

  /** Called when bouncing off a platform / spring / monster. */
  bounce(velocity, { spring = false } = {}) {
    this.vy = velocity;
    this.springBoost = spring;
    this.sinceBounce = 0;
    // The landing frames show the squat; a light procedural squash adds weight.
    this.scaleX = spring ? 1.18 : 1.1;
    this.scaleY = spring ? 0.82 : 0.9;
    this.spin = 0;
    this.trail.length = 0;
    if (this.pose !== POSE.SHOOT) this.poseTimer = 0;
  }

  canShoot() {
    return this.alive && this.shootCooldown <= 0;
  }

  shoot() {
    this.shootCooldown = PLAYER.SHOOT_COOLDOWN;
    this.setPose(POSE.SHOOT, PLAYER.SHOOT_POSE_TIME);
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.vy = Math.min(this.vy, -300);
    this.setPose(POSE.HURT);
  }

  update(dt, axis, worldWidth) {
    this.time += dt;
    this.prevY = this.y;

    if (this.alive) {
      // Horizontal: acceleration with friction for a floaty-but-responsive feel.
      if (axis !== 0) {
        this.vx += axis * PHYSICS.MOVE_ACCEL * dt;
        this.facing = axis;
      } else {
        const f = PHYSICS.MOVE_FRICTION * dt;
        this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
      }
      this.vx = clamp(this.vx, -PHYSICS.MAX_MOVE_SPEED, PHYSICS.MAX_MOVE_SPEED);
    } else {
      this.vx *= 0.98;
    }

    this.vy = Math.min(this.vy + PHYSICS.GRAVITY * dt, PHYSICS.MAX_FALL_SPEED);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Screen wrap-around (classic Doodle Jump behaviour).
    if (this.x < -PLAYER.HITBOX_WIDTH / 2) this.x += worldWidth + PLAYER.HITBOX_WIDTH;
    else if (this.x > worldWidth + PLAYER.HITBOX_WIDTH / 2)
      this.x -= worldWidth + PLAYER.HITBOX_WIDTH;

    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.updateAnimation(dt);
  }

  updateAnimation(dt) {
    this.sinceBounce += dt;

    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      this.frame = null; // pose override (shoot / cheer)
    } else if (!this.alive) {
      this.pose = POSE.HURT;
      this.frame = null;
    } else {
      this.pose = POSE.IDLE;
      this.frame = this.pickFrame();
    }

    // Gentle stretch while rising fast, relax to 1 otherwise.
    const speed = Math.abs(this.vy) / PHYSICS.SPRING_VELOCITY;
    const targetY = this.vy < 0 ? 1 + Math.min(0.06, -speed * 0.06) : 1;
    const targetX = 2 - targetY;
    this.scaleX = damp(this.scaleX, targetX, 14, dt);
    this.scaleY = damp(this.scaleY, targetY, 14, dt);

    // Lean into horizontal movement.
    const targetTilt = this.alive ? (this.vx / PHYSICS.MAX_MOVE_SPEED) * 0.18 : this.tilt;
    this.tilt = damp(this.tilt, targetTilt, 10, dt);
    if (!this.alive) this.tilt += dt * 5;

    this.updateTrail(dt);
  }

  /** Spring super-jump sheet first, then the regular 12-frame jump. */
  pickFrame() {
    if (this.springBoost) {
      const s = springFrame(this.vy, this.sinceBounce);
      if (s) {
        this.spin = s.flip * this.facing;
        return { sheet: 'spring', index: s.frame };
      }
      this.springBoost = false;
    }
    this.spin = 0;
    return { sheet: 'jump', index: jumpFrame(this.vy, this.sinceBounce) };
  }

  /** Record afterimages while blasting upward off a spring. */
  updateTrail(dt) {
    const S = ANIMATION.SPRING;
    const flying = this.springBoost && this.vy < S.TUCK_SPEED * 0.6 && this.frame;
    this.trailTimer -= dt;
    if (flying && this.trailTimer <= 0) {
      this.trailTimer = S.TRAIL_INTERVAL;
      this.trail.unshift({
        x: this.x,
        y: this.y,
        frame: this.frame,
        rotation: this.tilt + this.spin,
      });
      if (this.trail.length > S.TRAIL_LENGTH) this.trail.pop();
    } else if (!flying && this.trail.length && this.trailTimer <= 0) {
      this.trailTimer = S.TRAIL_INTERVAL;
      this.trail.pop(); // fade the trail out
    }
  }
}
