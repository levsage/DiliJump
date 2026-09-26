import { GAME_STATES } from '../config/constants.js';
import { EVENTS } from '../core/EventBus.js';
import { $, $$ } from './dom.js';
import { HUD } from './HUD.js';
import { MenuScreen } from './screens/MenuScreen.js';
import { GameOverScreen } from './screens/GameOverScreen.js';
import { LeaderboardScreen } from './screens/LeaderboardScreen.js';

/**
 * Maps game states to visible screens and routes button actions
 * (declared in HTML via `data-action`) to game methods.
 */
export class UIManager {
  constructor({ game, events, profile, wallet, leaderboard, settings, audio }) {
    Object.assign(this, { game, events, profile, wallet, leaderboard, settings, audio });

    this.screens = {
      loading: $('#screen-loading'),
      menu: $('#screen-menu'),
      pause: $('#screen-pause'),
      gameover: $('#screen-gameover'),
      leaderboard: $('#screen-leaderboard'),
    };
    this.controls = $('#controls');
    this.updateToast = $('#update-toast');
    this.updateReady = false;
    this.shootBtn = $('#shoot-btn');

    this.hud = new HUD({ events, profile });
    this.menu = new MenuScreen({
      profile,
      wallet,
      onNameChange: (name, oldName) => {
        this.hud.refreshProfile();
        leaderboard.rename(oldName, name);
      },
    });
    this.gameOver = new GameOverScreen({ profile, wallet });
    this.board = new LeaderboardScreen({
      leaderboard,
      profile,
      onProfileSynced: () => this.onProfileSynced(),
    });

    this.hud.setMuted(settings.muted);
    this.hud.setMusic(settings.music);
    this.unlockAudioOnFirstGesture();
    this.bindActions();
    this.bindShootButton();
    game.input.bindButtons(this.controls);
    events.on(EVENTS.STATE_CHANGE, ({ state }) => this.onState(state));
    events.on(EVENTS.RUN_SUBMITTED, (result) => this.gameOver.populate(result));
    events.on(EVENTS.UPDATE_READY, () => {
      this.updateReady = true;
      this.onState(this.game.state);
    });
    events.on(EVENTS.FATAL, () => this.showFatal());
    events.on(EVENTS.PROFILE_SYNCED, () => this.onProfileSynced());

    const touch = window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('is-touch', touch);
  }

  /** Best score / level changed to match the database: redraw what shows them. */
  onProfileSynced() {
    this.hud.refreshProfile();
    if (this.game.state === GAME_STATES.MENU) this.menu.refresh();
    if (this.game.state === GAME_STATES.GAME_OVER && this.game.lastResult) {
      this.gameOver.populate(this.game.lastResult);
    }
  }

  /** Unrecoverable runtime error: friendly message + reload button. */
  showFatal() {
    for (const el of Object.values(this.screens)) el.hidden = true;
    this.hud.show(false);
    this.controls.hidden = true;
    const s = this.screens.loading;
    s.innerHTML =
      '<p class="error">Oops — something went wrong.<br />Your coins and best score are saved.</p>' +
      '<button class="btn btn--primary" data-action="reload">↻ Reload</button>';
    s.hidden = false;
  }

  setProgress(p) {
    const bar = this.screens.loading.querySelector('[data-bind="progress"]');
    bar.style.width = `${Math.round(p * 100)}%`;
  }

  bindActions() {
    const actions = {
      play: () => {
        if (this.menu.ensureName()) this.game.start();
      },
      pause: () => this.game.pause(),
      resume: () => this.game.resume(),
      restart: () => this.game.start(),
      menu: () => this.game.quitToMenu(),
      leaderboard: () => this.openLeaderboard(),
      'close-leaderboard': () => this.closeLeaderboard(),
      reload: () => window.location.reload(),
      mute: () => {
        const muted = this.settings.toggleMuted();
        this.audio.setMuted(muted);
        this.hud.setMuted(muted);
      },
      music: () => {
        const on = this.settings.toggleMusic();
        this.audio.setMusicEnabled(on);
        this.hud.setMusic(on);
      },
    };
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const fn = actions[el.dataset.action];
      if (fn) {
        this.audio.unlock();
        fn();
      }
    });
  }

  /** Browsers only allow audio after a user gesture: start the menu music on the first one. */
  unlockAudioOnFirstGesture() {
    const unlock = () => {
      this.audio.unlock();
      if (this.audio.unlocked) {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  bindShootButton() {
    const fire = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game.input.queueShoot();
    };
    this.shootBtn.addEventListener('pointerdown', fire);
  }

  openLeaderboard() {
    this.screens.leaderboard.hidden = false;
    this.board.open();
  }

  closeLeaderboard() {
    this.board.close();
    this.screens.leaderboard.hidden = true;
  }

  onState(state) {
    const s = this.screens;
    if (!s.leaderboard.hidden) this.board.close();
    for (const el of Object.values(s)) el.hidden = true;
    const playing = state === GAME_STATES.PLAYING || state === GAME_STATES.PAUSED;
    this.hud.show(playing);
    this.controls.hidden = state !== GAME_STATES.PLAYING;
    // offer the update only outside a run, never mid-jump
    this.updateToast.hidden = !this.updateReady || playing;
    $$('.screen--overlay').forEach((el) => el.classList.remove('is-open'));

    switch (state) {
      case GAME_STATES.MENU:
        this.menu.refresh();
        s.menu.hidden = false;
        break;
      case GAME_STATES.PLAYING:
        this.hud.refreshProfile();
        break;
      case GAME_STATES.PAUSED:
        s.pause.hidden = false;
        break;
      case GAME_STATES.GAME_OVER:
        this.gameOver.populate(this.game.lastResult);
        s.gameover.hidden = false;
        break;
      default:
        break;
    }
  }
}
