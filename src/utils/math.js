/** Small, dependency-free math helpers. */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Map `v` from [inMin, inMax] to [outMin, outMax] and clamp. */
export const remap = (v, inMin, inMax, outMin, outMax) =>
  lerp(outMin, outMax, clamp((v - inMin) / (inMax - inMin), 0, 1));

/** Frame-rate independent exponential approach. */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
