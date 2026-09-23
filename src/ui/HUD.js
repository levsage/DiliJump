import { EVENTS } from '../core/EventBus.js';
import { $, bound, setText, pulse } from './dom.js';
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

  setMuted(muted) {
    const btn = $('[data-action="mute"]', this.root);
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', String(muted));
  }

  show(visible) {
    this.root.hidden = !visible;
  }
}
