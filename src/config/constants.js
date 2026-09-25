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

/**
 * Solid side walls: the mascot can't leave the playfield through either side
 * (no screen wrap-around). Everything else (platforms, monsters, coins) lives
 * between the walls too.
 */
export const WALL = Object.freeze({
  WIDTH: 16,
  /** How far gloves / cape may tuck behind a wall (the body itself never does). */
  PLAYER_OVERLAP: 6,
  /** Hitting a wall faster than this gives a little bump (dust, glow, sound). */
  BUMP_SPEED: 200,
  /** Seconds the wall glow lasts after a bump. */
  FLASH_TIME: 0.35,
});

/** Horizontal bounds of the playable area between the walls. */
export const PLAYFIELD = Object.freeze({
  LEFT: WALL.WIDTH,
  RIGHT: VIEW.WIDTH - WALL.WIDTH,
  WIDTH: VIEW.WIDTH - WALL.WIDTH * 2,
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
  SHOOT_POSE_TIME: 0.28,
  SHOOT_COOLDOWN: 0.22,
});

/** Mascot + spring animation timing (see src/entities/animation.js). */
export const ANIMATION = Object.freeze({
  /** How long the squat frame shows after each bounce (3-frame jump). */
  SQUAT_TIME: 0.1,
  SPRING: {
    CHARGE_TIME: 0.05,
    BLAST_TIME: 0.12,
    FLIGHT_FPS: 14,
    /** Upward speeds (negative = up) where the somersault starts / ends. */
    TUCK_SPEED: -650,
    UNFOLD_SPEED: -170,
    /** Falling speed at which the spring sequence hands over to the jump sheet. */
    END_SPEED: 140,
    /** Afterimages drawn behind the mascot during the super-jump. */
    TRAIL_LENGTH: 4,
    TRAIL_INTERVAL: 0.035,
  },
  SPRING_PAD: {
    DURATION: 1.2,
    COMPRESS_TIME: 0.05,
    COMPRESS: 0.55,
    OVERSHOOT: 1.25,
    WOBBLE_HZ: 3.6,
    DAMPING: 4.2,
  },
});

export const MUSIC = Object.freeze({
  /** Score at which the soundtrack adds its extra "high up" layer. */
  HIGH_INTENSITY_SCORE: 2500,
  MENU_VOLUME: 0.8,
  PAUSE_VOLUME: 0.3,
  GAME_OVER_VOLUME: 0.45,
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
  WIDTH: 32,
  HEIGHT: 18,
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
