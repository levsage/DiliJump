import { PHYSICS } from '../config/constants.js';

/**
 * Fixed-timestep loop with interpolation-free rendering.
 * `update(dt)` always receives PHYSICS.FIXED_STEP, which keeps physics
 * deterministic and prevents tunnelling on slow frames.
 */
export class GameLoop {
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.accumulator = 0;
    this.last = 0;
    this.rafId = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  tick(now) {
    if (!this.running) return;
    const frame = Math.min((now - this.last) / 1000, PHYSICS.MAX_FRAME_TIME);
    this.last = now;
    this.accumulator += frame;

    const step = PHYSICS.FIXED_STEP;
    while (this.accumulator >= step) {
      this.update(step);
      this.accumulator -= step;
    }
    this.render(frame);
    this.rafId = requestAnimationFrame(this.tick);
  }
}
