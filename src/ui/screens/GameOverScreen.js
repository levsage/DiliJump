import { $, bound, setText } from '../dom.js';
import { formatNumber } from '../../utils/format.js';
import { ASSETS } from '../../config/assets.js';

/** End-of-run scoreboard. Re-populated when the leaderboard rank arrives. */
export class GameOverScreen {
  constructor({ profile, wallet }) {
    this.root = $('#screen-gameover');
    this.profile = profile;
    this.wallet = wallet;
  }

  populate({ score, coins, isBest, rank, height, pending, online, queued }) {
    const r = this.root;
    setText('result-score', formatNumber(score), r);
    setText('result-best', formatNumber(this.profile.bestScore), r);
    setText('result-height', formatNumber(height / 10), r);
    setText('result-coins', formatNumber(coins), r);
    setText('result-wallet', formatNumber(this.wallet.balance), r);

    const celebrate = Boolean(isBest);
    setText('result-title', celebrate ? 'New Record!' : 'Game Over', r);
    bound('result-hero', r)[0].src = ASSETS.images[celebrate ? 'player.cheer' : 'player.hurt'];
    r.querySelector('.scoreboard').classList.toggle('is-record', celebrate);

    const badge = bound('result-badge', r)[0];
    badge.hidden = false;
    badge.classList.toggle('is-muted', !rank);
    if (pending) {
      badge.textContent = '⏳ Submitting to leaderboard…';
    } else if (rank === 1) {
      badge.textContent = isBest
        ? `🥇 #1 on the ${online ? 'global ' : ''}leaderboard!`
        : `🥇 You're still #1 on the ${online ? 'global ' : ''}leaderboard`;
    } else if (rank > 0) {
      badge.textContent = `🏆 Your best is #${rank} on the ${online ? 'global ' : ''}leaderboard`;
    } else if (queued) {
      badge.textContent = '📡 Offline — score will sync when you reconnect';
    } else if (score <= 0) {
      badge.hidden = true;
    } else {
      badge.textContent = 'Keep climbing to reach the leaderboard!';
    }
  }
}
