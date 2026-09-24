import { PHYSICS } from '../config/constants.js';

/** Consecutive failing frames before the loop gives up and reports a fatal error. */
export const MAX_FRAME_ERRORS = 30;

/**
 * Fixed-timestep loop with interpolation-free rendering.
 * `update(dt)` always receives PHYSICS.FIXED_STEP, which keeps physics
 * deterministic and prevents tunnelling on slow frames.
 * An exception in a frame is logged once and the loop keeps going; only a
 * persistent failure stops it and calls `onFatal(err)`.
 */
export class GameLoop {
  constructor({ update, render, onFatal = () => {} }) {
    this.update = update;
    this.render = render;
    this.onFatal = onFatal;
    this.frameErrors = 0;
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
    // schedule first: one bad frame must never freeze the game
    this.rafId = requestAnimationFrame(this.tick);
    const frame = Math.min((now - this.last) / 1000, PHYSICS.MAX_FRAME_TIME);
    this.last = now;
    this.accumulator += frame;

    try {
      const step = PHYSICS.FIXED_STEP;
      while (this.accumulator >= step) {
        this.update(step);
        this.accumulator -= step;
      }
      this.render(frame);
      this.frameErrors = 0;
    } catch (err) {
      this.accumulator = 0;
      if (++this.frameErrors === 1) console.error('[loop]', err);
      if (this.frameErrors >= MAX_FRAME_ERRORS) {
        this.stop();
        this.onFatal(err);
      }
    }
  }
}
