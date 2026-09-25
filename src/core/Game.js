import { GAME_STATES, MUSIC } from '../config/constants.js';
import { GameLoop } from './GameLoop.js';
import { World } from './World.js';
import { EVENTS } from './EventBus.js';
import { POSE } from '../entities/Player.js';

/**
 * Top-level orchestrator: owns the state machine
 * (menu → playing ⇄ paused → gameover → …) and wires the world, renderer,
 * services, audio and UI together via the event bus.
 */
export class Game {
  constructor({ events, input, renderer, audio, profile, wallet, leaderboard }) {
    Object.assign(this, { events, input, renderer, audio, profile, wallet, leaderboard });
    this.world = new World(events);
    this.state = GAME_STATES.LOADING;
    this.menuTime = 0;
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (dt) => this.render(dt),
      onFatal: (err) => this.events.emit(EVENTS.FATAL, err),
    });
    this.bindAudio();
    this.input.onPause = () => this.togglePause();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === GAME_STATES.PLAYING) this.pause();
      if (document.hidden) this.audio.suspend();
      else this.audio.resume();
    });
  }

  bindAudio() {
    // Only react to gameplay events during a real run (not the menu demo).
    const on = (event, fn) =>
      this.events.on(event, (payload) => {
        if (this.state === GAME_STATES.PLAYING) fn(payload);
      });
    on(EVENTS.JUMP, () => this.audio.jump());
    on(EVENTS.SPRING, () => this.audio.spring());
    on(EVENTS.COIN, (n) => {
      this.audio.coin();
      this.wallet.add(1);
      this.events.emit(EVENTS.HUD_COINS, n);
    });
    on(EVENTS.SHOOT, () => this.audio.shoot());
    on(EVENTS.WALL_BUMP, () => this.audio.bump());
    on(EVENTS.PLATFORM_BREAK, () => this.audio.crack());
    on(EVENTS.MONSTER_KILL, () => this.audio.stomp());
    on(EVENTS.PLAYER_HIT, () => this.audio.hit());
    on(EVENTS.GAME_OVER, () => this.finishRun());
  }

  setState(state) {
    const prev = this.state;
    this.state = state;
    this.input.enabled = state === GAME_STATES.PLAYING;
    this.updateMusic();
    this.events.emit(EVENTS.STATE_CHANGE, { state, prev });
  }

  /** Soundtrack follows the game state; it gets fuller as you climb. */
  updateMusic() {
    const { PLAYING, PAUSED, GAME_OVER } = GAME_STATES;
    const high = this.world.totalScore >= MUSIC.HIGH_INTENSITY_SCORE;
    const level = this.state === PLAYING || this.state === PAUSED ? (high ? 2 : 1) : 0;
    const volume =
      this.state === PAUSED
        ? MUSIC.PAUSE_VOLUME
        : this.state === GAME_OVER
          ? MUSIC.GAME_OVER_VOLUME
          : this.state === PLAYING
            ? 1
            : MUSIC.MENU_VOLUME;
    if (level !== this.musicLevel || volume !== this.musicVolume) {
      this.musicLevel = level;
      this.musicVolume = volume;
      this.audio.setMusicMode(level, volume);
    }
  }

  boot() {
    this.world.reset();
    this.setState(GAME_STATES.MENU);
    this.loop.start();
  }

  start() {
    this.audio.unlock();
    this.input.reset();
    this.world.reset();
    this.wallet.startRun();
    this.events.emit(EVENTS.SCORE, 0);
    this.events.emit(EVENTS.HUD_COINS, 0);
    this.setState(GAME_STATES.PLAYING);
  }

  pause() {
    if (this.state !== GAME_STATES.PLAYING) return;
    this.setState(GAME_STATES.PAUSED);
  }

  resume() {
    if (this.state !== GAME_STATES.PAUSED) return;
    this.input.reset();
    this.setState(GAME_STATES.PLAYING);
  }

  togglePause() {
    if (this.state === GAME_STATES.PLAYING) this.pause();
    else if (this.state === GAME_STATES.PAUSED) this.resume();
  }

  quitToMenu() {
    this.world.reset();
    this.setState(GAME_STATES.MENU);
  }

  finishRun() {
    if (this.state !== GAME_STATES.PLAYING) return;
    const score = this.world.totalScore;
    const height = Math.floor(this.world.altitude);
    const coins = this.wallet.commitRun();
    const prevLevel = this.profile.level;
    const isBest = this.profile.recordRun(score);
    if (isBest) this.audio.highScore();
    else this.audio.gameOver();
    let levelUpPlayed = false;
    const celebrateLevel = () => {
      if (levelUpPlayed || this.profile.level <= prevLevel) return;
      levelUpPlayed = true;
      setTimeout(() => this.audio.levelUp(), 750);
    };
    celebrateLevel();
    const levelInfo = () => ({
      prevLevel,
      level: this.profile.level,
      totalScore: this.profile.totalScore,
      levelUp: this.profile.level > prevLevel,
    });

    // Show the scoreboard right away; the leaderboard rank arrives async.
    this.lastResult = { score, coins, isBest, height, rank: null, pending: true, ...levelInfo() };
    setTimeout(() => this.setState(GAME_STATES.GAME_OVER), 650);

    this.leaderboard
      .submit({
        name: this.profile.name,
        score,
        coins,
        height,
        durationMs: this.world.elapsed * 1000,
      })
      .then((res) => {
        // the database total includes the whole run history — adopt it
        if (Number.isFinite(res.totalScore)) this.profile.syncTotal(res.totalScore);
        celebrateLevel();
        Object.assign(this.lastResult, {
          ...res,
          isBest: isBest || res.isBest,
          pending: false,
          ...levelInfo(),
        });
        this.events.emit(EVENTS.RUN_SUBMITTED, this.lastResult);
      });
  }

  update(dt) {
    if (this.state === GAME_STATES.PLAYING) {
      this.world.update(dt, this.input);
      this.updateMusic();
    } else if (this.state === GAME_STATES.MENU) {
      this.updateMenuDemo(dt);
    } else if (this.state === GAME_STATES.GAME_OVER) {
      this.world.particles.update(dt);
    }
  }

  /** Attract-mode: the mascot bounces in place behind the menu. */
  updateMenuDemo(dt) {
    this.menuTime += dt;
    const w = this.world;
    const idle = { axis: 0, consumeShoot: () => false };
    w.update(dt, idle);
    if (w.over) w.reset();
    // Cycle celebratory poses at the top of each bounce.
    const p = w.player;
    if (Math.abs(p.vy) < 90 && p.poseTimer <= 0 && Math.floor(this.menuTime / 3) % 2 === 1) {
      p.setPose(POSE.CHEER, 0.35);
    }
  }

  render(dt) {
    const paused = this.state === GAME_STATES.PAUSED;
    this.renderer.render(this.world, this.world.camera, paused ? 0 : dt);
  }
}
