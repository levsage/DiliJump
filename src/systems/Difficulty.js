import { PLATFORM, PLATFORM_TYPES, MONSTER, COIN, SPRING } from '../config/constants.js';
import { remap } from '../utils/math.js';

/**
 * Maps the current score (height climbed) to generation parameters.
 * Pure function => easy to unit test and tune.
 */
export function getDifficulty(score) {
  const t = remap(score, 0, 12000, 0, 1); // 0 → 1 over the first 12k points

  return {
    level: t,
    gapMin: remap(score, 0, 12000, PLATFORM.MIN_GAP, PLATFORM.MIN_GAP + 60),
    gapMax: remap(score, 0, 12000, PLATFORM.MIN_GAP + 50, PLATFORM.MAX_GAP),
    typeWeights: {
      [PLATFORM_TYPES.NORMAL]: remap(score, 0, 12000, 1, 0.35),
      [PLATFORM_TYPES.MOVING]: remap(score, 500, 10000, 0, 0.35),
      [PLATFORM_TYPES.VANISHING]: remap(score, 2500, 12000, 0, 0.2),
    },
    breakingChance: remap(score, 300, 8000, 0.05, 0.3),
    movingSpeed: remap(score, 500, 15000, PLATFORM.MOVING_SPEED_MIN, PLATFORM.MOVING_SPEED_MAX),
    monsterChance:
      score < MONSTER.MIN_SCORE
        ? 0
        : remap(score, MONSTER.MIN_SCORE, 15000, MONSTER.SPAWN_CHANCE, 0.14),
    coinChance: COIN.SPAWN_CHANCE,
    springChance: SPRING.SPAWN_CHANCE,
  };
}
