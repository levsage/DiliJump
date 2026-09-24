import { describe, expect, it } from 'vitest';
import { ANIMATION, PHYSICS } from '../src/config/constants.js';
import {
  JUMP_FRAMES,
  SPRING_FRAMES,
  jumpFrame,
  springFrame,
  springStretch,
} from '../src/entities/animation.js';
import { Player } from '../src/entities/Player.js';

/** Simulate one bounce with the real physics and collect the frames shown. */
function simulateJump(velocity, landAtStartHeight = true) {
  const dt = PHYSICS.FIXED_STEP;
  let y = 0;
  let vy = velocity;
  let t = 0;
  const frames = [];
  while (!(landAtStartHeight && vy > 0 && y >= 0) && t < 5) {
    frames.push({ t, vy, frame: jumpFrame(vy, t) });
    vy = Math.min(vy + PHYSICS.GRAVITY * dt, PHYSICS.MAX_FALL_SPEED);
    y += vy * dt;
    t += dt;
  }
  return frames;
}

describe('12-frame jump animation', () => {
  it('plays every one of the 12 frames, in order, during a normal jump', () => {
    const seq = simulateJump(PHYSICS.JUMP_VELOCITY).map((f) => f.frame);
    const shown = [...new Set(seq)];
    expect(JUMP_FRAMES).toBe(12);
    expect(shown).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // never goes backwards
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
  });

  it('gives each airborne frame a visible amount of time (≥ 2 render frames at 60 fps)', () => {
    const counts = new Map();
    for (const { frame } of simulateJump(PHYSICS.JUMP_VELOCITY))
      counts.set(frame, (counts.get(frame) ?? 0) + 1);
    for (let f = 0; f < 12; f++)
      expect(counts.get(f) * PHYSICS.FIXED_STEP).toBeGreaterThanOrEqual(2 / 60 - 1e-9);
  });

  it('starts with the landing squat and shows the ready-to-land frame when falling fast', () => {
    expect(jumpFrame(PHYSICS.JUMP_VELOCITY, 0)).toBe(0);
    expect(jumpFrame(ANIMATION.FALL_READY_SPEED + 1, 1)).toBe(11);
    expect(jumpFrame(-5, 1)).toBe(7); // apex hang
    expect(jumpFrame(5, 1)).toBe(8);
  });
});

describe('spring super-jump animation', () => {
  it('goes charge → blast-off → flight loop → somersault → unfold → back to the jump sheet', () => {
    const dt = PHYSICS.FIXED_STEP;
    let vy = PHYSICS.SPRING_VELOCITY;
    const seen = [];
    let maxFlip = 0;
    for (let t = 0; t < 3; t += dt) {
      const s = springFrame(vy, t);
      if (!s) break;
      if (seen.at(-1) !== s.frame) seen.push(s.frame);
      maxFlip = Math.max(maxFlip, s.flip);
      vy += PHYSICS.GRAVITY * dt;
    }
    expect(seen.slice(0, 3)).toEqual([0, 1, 2]);
    expect(new Set(seen)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(seen.slice(-3)).toEqual([5, 6, 7]);
    expect(maxFlip).toBeCloseTo(Math.PI * 2, 5); // exactly one somersault
    expect(SPRING_FRAMES).toBe(8);
    expect(springFrame(ANIMATION.SPRING.END_SPEED + 1, 2)).toBeNull();
  });

  it('player switches to the jump sheet after the spring sequence', () => {
    const p = new Player(100, 500);
    p.bounce(PHYSICS.SPRING_VELOCITY, { spring: true });
    p.update(0.001, 0, 480);
    expect(p.frame).toEqual({ sheet: 'spring', index: 0 });
    for (let i = 0; i < 200; i++) p.update(PHYSICS.FIXED_STEP, 0, 480);
    expect(p.frame.sheet).toBe('jump');
    expect(p.springBoost).toBe(false);
    expect(p.spin).toBe(0);
  });

  it('leaves afterimages while flying and clears them afterwards', () => {
    const p = new Player(100, 500);
    p.bounce(PHYSICS.SPRING_VELOCITY, { spring: true });
    for (let i = 0; i < 40; i++) p.update(PHYSICS.FIXED_STEP, 0, 480);
    expect(p.trail.length).toBeGreaterThan(0);
    expect(p.trail.length).toBeLessThanOrEqual(ANIMATION.SPRING.TRAIL_LENGTH);
    for (let i = 0; i < 300; i++) p.update(PHYSICS.FIXED_STEP, 0, 480);
    expect(p.trail.length).toBe(0);
  });
});

describe('spring pad boing', () => {
  it('squashes, overshoots above rest height, then settles', () => {
    const S = ANIMATION.SPRING_PAD;
    expect(springStretch(-1)).toBe(0);
    expect(springStretch(S.COMPRESS_TIME)).toBeCloseTo(-S.COMPRESS, 5);
    let peak = 0;
    for (let t = S.COMPRESS_TIME; t < S.COMPRESS_TIME + 0.2; t += 0.005)
      peak = Math.max(peak, springStretch(t));
    expect(peak).toBeGreaterThan(0.5);
    expect(Math.abs(springStretch(S.DURATION - 0.01))).toBeLessThan(0.05);
    expect(springStretch(S.DURATION + 1)).toBe(0);
  });
});
