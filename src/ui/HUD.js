import { EVENTS } from '../core/EventBus.js';
import { $, bound, setText, pulse } from './dom.js';
import { levelLabel } from './levelView.js';
import { formatNumber } from '../utils/format.js';

/**
 * In-game overlay: custom name bar, live score (+ personal best) and the
 * DLI coin bar. Updates only when values change to avoid layout thrash.
 */
export class HUD {
  constructor({ events, profile }) {
    this.root = $('#hud');
    this.profile = profile;
    this.scoreEl = bound('score', this.root)[0];
    this.coinEl = $('.coinbar', this.root);
    this.lastScore = -1;

    events.on(EVENTS.SCORE, (score) => this.setScore(score));
    events.on(EVENTS.HUD_COINS, (n) => this.setCoins(n));
  }

  refreshProfile() {
    setText('player-name', this.profile.name, this.root);
    setText('player-level', levelLabel(this.profile.level), this.root);
    setText('best', formatNumber(this.profile.bestScore), this.root);
  }

  setScore(score) {
    if (score === this.lastScore) return;
    this.lastScore = score;
    this.scoreEl.textContent = formatNumber(score);
    if (score > this.profile.bestScore && this.profile.bestScore > 0) {
      this.root.classList.add('is-record');
    } else if (score === 0) {
      this.root.classList.remove('is-record');
    }
  }

  setCoins(n) {
    setText('run-coins', formatNumber(n), this.root);
    if (n > 0) pulse(this.coinEl);
  }

  /** Updates every sound toggle (HUD + menu). */
  setMuted(muted) {
    for (const btn of document.querySelectorAll('[data-action="mute"]')) {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-pressed', String(muted));
    }
  }

  /** Updates every music toggle (HUD + menu). */
  setMusic(on) {
    for (const btn of document.querySelectorAll('[data-action="music"]')) {
      btn.classList.toggle('is-off', !on);
      btn.setAttribute('aria-pressed', String(!on));
      btn.title = on ? 'Music on' : 'Music off';
    }
  }

  show(visible) {
    this.root.hidden = !visible;
  }
}
