import { PHYSICS, PLAYER } from '../config/constants.js';
import { clamp, damp } from '../utils/math.js';

/**
 * Pose state machine for the mascot. Each pose maps 1:1 to a generated
 * sprite (see public/assets/sprites). Procedural squash/stretch, tilt and
 * facing are layered on top for smooth animation between key poses.
 */
export const POSE = Object.freeze({
  IDLE: 'idle',
  JUMP: 'jump',
  FALL: 'fall',
  CROUCH: 'crouch',
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
    this.scaleX = 1.25; // squash on contact, springs back via damp()
    this.scaleY = 0.75;
    this.setPose(POSE.CROUCH, PLAYER.LANDING_POSE_TIME);
    if (spring) this.spin = 0;
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
    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
    } else if (!this.alive) {
      this.pose = POSE.HURT;
    } else if (this.vy < -80) {
      this.pose = POSE.JUMP;
    } else if (this.vy > 120) {
      this.pose = POSE.FALL;
    } else {
      this.pose = POSE.IDLE; // hang-time at the apex
    }

    // Stretch while rising fast, relax to 1 otherwise.
    const speed = Math.abs(this.vy) / PHYSICS.SPRING_VELOCITY;
    const targetY = this.vy < 0 ? 1 + Math.min(0.12, -speed * 0.12) : 1;
    const targetX = 2 - targetY;
    this.scaleX = damp(this.scaleX, targetX, 14, dt);
    this.scaleY = damp(this.scaleY, targetY, 14, dt);

    // Lean into horizontal movement.
    const targetTilt = this.alive ? (this.vx / PHYSICS.MAX_MOVE_SPEED) * 0.18 : this.tilt;
    this.tilt = damp(this.tilt, targetTilt, 10, dt);

    // Spring super-jump: full somersault while rising.
    if (this.springBoost && this.vy < 0) this.spin += dt * 12;
    else {
      this.springBoost = false;
      this.spin = damp(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 12, dt);
    }
    if (!this.alive) this.tilt += dt * 5;
  }
}
