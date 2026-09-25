import { ANIMATION } from '../config/constants.js';
import { clamp } from '../utils/math.js';

/**
 * Frame selection for the mascot's animation sheets. Frames are driven by the
 * physics state (vertical velocity + time since the last bounce), not by a
 * clock, so the animation always lines up with the actual jump arc no matter
 * how high or long the jump is.
 *
 * Jump sheet (3 frames — picked from the 30-frame source art):
 *   0  squat / push-off   (for ANIMATION.SQUAT_TIME right after a bounce)
 *   1  rising, fists up   (while moving up)
 *   2  falling, cape up   (while moving down)
 *
 * Spring sheet (8 frames):
 *   0     charge        1  blast-off        2-4  superhero flight (cape flutter loop)
 *   5-6   somersault tuck (with one full flip)                7  unfold at the top
 */
export const JUMP_FRAMES = 3;
export const SPRING_FRAMES = 8;

/** Frame index of each phase on the 3-frame jump sheet. */
export const JUMP_POSE = Object.freeze({ SQUAT: 0, RISE: 1, FALL: 2 });

/** @returns {number} frame index 0-2 on the jump sheet */
export function jumpFrame(vy, sinceBounce) {
  if (sinceBounce < ANIMATION.SQUAT_TIME) return JUMP_POSE.SQUAT;
  return vy < 0 ? JUMP_POSE.RISE : JUMP_POSE.FALL;
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
