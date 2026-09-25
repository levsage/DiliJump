import { LEVELS } from '../config/constants.js';

/**
 * Player level from lifetime XP (= the sum of the scores of all runs).
 * Pure functions, mirrored by public.player_level() in the database so the
 * leaderboard and the game always agree.
 */

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level) {
  const n = Math.max(0, Math.floor(level) - 1);
  return LEVELS.BASE_XP * n + (LEVELS.STEP_XP * n * (n - 1)) / 2;
}

/** Level reached with `xp` total XP (≥ 1). */
export function levelFromXp(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  const { BASE_XP: b, STEP_XP: s } = LEVELS;
  // solve s/2·n² + (b − s/2)·n = xp for n, then fix float rounding
  const k = b - s / 2;
  let n = Math.floor((-k + Math.sqrt(k * k + 2 * s * total)) / s);
  while (xpForLevel(n + 2) <= total) n++;
  while (n > 0 && xpForLevel(n + 1) > total) n--;
  return n + 1;
}

/**
 * @returns {{ level: number, xp: number, levelXp: number, nextXp: number,
 *             into: number, needed: number, progress: number }}
 *   `into` = XP earned inside the current level, `needed` = XP the level spans.
 */
export function levelProgress(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelFromXp(total);
  const levelXp = xpForLevel(level);
  const nextXp = xpForLevel(level + 1);
  const needed = nextXp - levelXp;
  return {
    level,
    xp: total,
    levelXp,
    nextXp,
    into: total - levelXp,
    needed,
    progress: needed > 0 ? (total - levelXp) / needed : 0,
  };
}
