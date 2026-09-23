/**
 * Central game configuration.
 * All tunable numbers live here so gameplay can be balanced without
 * touching engine code. Units: pixels, seconds, pixels/second.
 */

export const APP = Object.freeze({
  NAME: 'DiliJump',
  VERSION: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
  REPO_URL: 'https://github.com/levsage/DiliJump',
  STORAGE_PREFIX: 'dilijump:v1:',
});

/** Logical (virtual) resolution — the canvas is scaled to fit the screen. */
export const VIEW = Object.freeze({
  WIDTH: 480,
  HEIGHT: 800,
  MAX_DPR: 2,
});

export const PHYSICS = Object.freeze({
  GRAVITY: 2150,
  JUMP_VELOCITY: -1010,
  SPRING_VELOCITY: -1650,
  STOMP_VELOCITY: -1100,
  MAX_FALL_SPEED: 1500,
  MOVE_ACCEL: 3600,
  MOVE_FRICTION: 2400,
  MAX_MOVE_SPEED: 430,
  FIXED_STEP: 1 / 120,
  MAX_FRAME_TIME: 0.25,
});

export const PLAYER = Object.freeze({
  DRAW_HEIGHT: 104,
  /** Collision box relative to the player's bottom-centre anchor. */
  HITBOX_WIDTH: 44,
  HITBOX_HEIGHT: 84,
  FEET_WIDTH: 40,
  LANDING_POSE_TIME: 0.1,
  SHOOT_POSE_TIME: 0.28,
  SHOOT_COOLDOWN: 0.22,
});

export const PLATFORM = Object.freeze({
  WIDTH: 84,
  HEIGHT: 18,
  MIN_GAP: 64,
  /** Must stay safely below the jump apex (v² / 2g ≈ 237px). */
  MAX_GAP: 200,
  MOVING_SPEED_MIN: 60,
  MOVING_SPEED_MAX: 170,
  BREAK_FALL_GRAVITY: 1800,
});

export const PLATFORM_TYPES = Object.freeze({
  NORMAL: 'normal',
  MOVING: 'moving',
  BREAKING: 'breaking',
  VANISHING: 'vanishing',
});

export const COIN = Object.freeze({
  RADIUS: 15,
  SPAWN_CHANCE: 0.32,
  TRAIL_CHANCE: 0.07,
  SCORE_BONUS: 10,
});

export const SPRING = Object.freeze({
  WIDTH: 28,
  HEIGHT: 16,
  SPAWN_CHANCE: 0.06,
});

export const MONSTER = Object.freeze({
  WIDTH: 64,
  HEIGHT: 52,
  MIN_SCORE: 1200,
  SPAWN_CHANCE: 0.05,
  STOMP_SCORE: 50,
  SHOOT_SCORE: 30,
});

export const PROJECTILE = Object.freeze({
  SPEED: 1100,
  RADIUS: 6,
});

export const CAMERA = Object.freeze({
  /** Player is kept at or below this fraction of the screen height. */
  FOLLOW_LINE: 0.42,
});

export const SCORING = Object.freeze({
  PIXELS_PER_POINT: 6,
});

export const LEADERBOARD = Object.freeze({
  MAX_ENTRIES: 10,
});

export const PROFILE = Object.freeze({
  NAME_MIN: 2,
  NAME_MAX: 16,
  DEFAULT_NAME: 'Player',
});

export const GAME_STATES = Object.freeze({
  LOADING: 'loading',
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover',
});
