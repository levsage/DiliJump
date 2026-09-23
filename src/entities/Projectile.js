import { PROJECTILE } from '../config/constants.js';

/** Energy bolt fired straight up by the player. */
export class Projectile {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = PROJECTILE.RADIUS;
    this.vy = -PROJECTILE.SPEED;
    this.dead = false;
  }

  update(dt, cameraY) {
    this.y += this.vy * dt;
    if (this.y < cameraY - 50) this.dead = true;
  }
}
