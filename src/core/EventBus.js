/** Minimal publish/subscribe bus used to decouple gameplay from UI/audio. */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }
}

/** Event names — keep in one place to avoid typos. */
export const EVENTS = Object.freeze({
  STATE_CHANGE: 'state:change',
  SCORE: 'score:change',
  COIN: 'coin:collect',
  JUMP: 'player:jump',
  SPRING: 'player:spring',
  SHOOT: 'player:shoot',
  WALL_BUMP: 'player:wall-bump',
  PLATFORM_BREAK: 'platform:break',
  MONSTER_KILL: 'monster:kill',
  PLAYER_HIT: 'player:hit',
  GAME_OVER: 'game:over',
  HUD_COINS: 'hud:coins',
  RUN_SUBMITTED: 'run:submitted',
  FATAL: 'app:fatal',
  UPDATE_READY: 'app:update-ready',
});
