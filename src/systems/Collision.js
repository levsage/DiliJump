/** Pure collision helpers (no side effects) — unit tested. */

export const aabbOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const circleRectOverlap = (cx, cy, r, rect) => {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
};

/**
 * One-way platform landing test: the feet must have crossed the platform's
 * top edge this step while moving downward, and overlap horizontally.
 */
export const landsOn = (feet, prevY, y, vy, surface) =>
  vy > 0 &&
  prevY <= surface.y &&
  y >= surface.y &&
  feet.right > surface.x &&
  feet.left < surface.x + surface.w;
