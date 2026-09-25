import { ANIMATION, PHYSICS } from '../config/constants.js';
import { clamp } from '../utils/math.js';

/**
 * Frame selection for the mascot's animation sheets. Frames are driven by the
 * physics state (vertical velocity + time since the last bounce), not by a
 * clock, so the animation always lines up with the actual jump arc no matter
 * how high or long the jump is.
 *
 * Jump sheet (30 frames, see JUMP_PHASES):
 *   0-7   touch-down → deep squat → push-off → tiptoes   (time based, after a bounce)
 *   8-17  launch → rising → joyful apex → floating hang  (by upward velocity)
 *   18-27 arms up → cape billowing up → arms out         (by downward velocity)
 *   28-29 legs reaching down, about to touch down         (falling fast)
 *
 * Spring sheet (8 frames):
 *   0     charge        1  blast-off        2-4  superhero flight (cape flutter loop)
 *   5-6   somersault tuck (with one full flip)                7  unfold at the top
 */
export const JUMP_FRAMES = 30;
export const SPRING_FRAMES = 8;

/** Frame ranges [first, end) of each phase on the 30-frame jump sheet. */
export const JUMP_PHASES = Object.freeze({
  LAND: [0, 8],
  RISE: [8, 18],
  FALL: [18, 28],
  READY: [28, 30],
});

const { LAND, RISE, FALL } = JUMP_PHASES;
const LAND_TOTAL = ANIMATION.LAND_FRAME_TIME * (LAND[1] - LAND[0]);
/** Upward speed left once the landing frames have played. */
const RISE_SPEED = Math.abs(PHYSICS.JUMP_VELOCITY) - PHYSICS.GRAVITY * LAND_TOTAL;

/** Pick a frame in [first, end) for progress t ∈ [0, 1). */
const inPhase = ([first, end], t) => first + Math.floor(clamp(t, 0, 0.999) * (end - first));

/** @returns {number} frame index 0-29 on the jump sheet */
export function jumpFrame(vy, sinceBounce) {
  if (sinceBounce < LAND_TOTAL) return inPhase(LAND, sinceBounce / LAND_TOTAL);
  if (vy < 0) return inPhase(RISE, 1 - -vy / RISE_SPEED);
  if (vy < ANIMATION.FALL_READY_SPEED) return inPhase(FALL, vy / ANIMATION.FALL_READY_SPEED);
  return vy < ANIMATION.TOUCHDOWN_SPEED ? JUMP_PHASES.READY[0] : JUMP_PHASES.READY[0] + 1;
}

/**
 * @returns {{ frame: number, flip: number } | null} frame on the spring sheet
 *   plus somersault rotation (radians), or null once the super-jump is over
 *   and the regular falling frames should take over.
 */
export function springFrame(vy, sinceBounce) {
  const S = ANIMATION.SPRING;
  if (sinceBounce < S.CHARGE_TIME) return { frame: 0, flip: 0 };
  const flightTime = sinceBounce - S.CHARGE_TIME - S.BLAST_TIME;
  if (flightTime < 0) return { frame: 1, flip: 0 };
  if (vy < S.TUCK_SPEED) {
    const loop = [2, 3, 4, 3]; // cape flutter
    return { frame: loop[Math.floor(flightTime * S.FLIGHT_FPS) % loop.length], flip: 0 };
  }
  if (vy < S.UNFOLD_SPEED) {
    const p = clamp((vy - S.TUCK_SPEED) / (S.UNFOLD_SPEED - S.TUCK_SPEED), 0, 1);
    return { frame: p < 0.5 ? 5 : 6, flip: easeInOut(p) * Math.PI * 2 };
  }
  if (vy < S.END_SPEED) return { frame: 7, flip: Math.PI * 2 };
  return null;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Spring pad stretch over time after being triggered: a quick compression,
 * then an elastic "boing" that overshoots and wobbles back to rest.
 * @returns {number} relative stretch (-0.55 = squashed, +0.8 = stretched)
 */
export function springStretch(t) {
  const S = ANIMATION.SPRING_PAD;
  if (t < 0 || t > S.DURATION) return 0;
  if (t < S.COMPRESS_TIME) return -S.COMPRESS * (t / S.COMPRESS_TIME);
  const u = t - S.COMPRESS_TIME;
  const w = Math.PI * 2 * S.WOBBLE_HZ;
  return Math.exp(-S.DAMPING * u) * (-S.COMPRESS * Math.cos(w * u) + S.OVERSHOOT * Math.sin(w * u));
}
