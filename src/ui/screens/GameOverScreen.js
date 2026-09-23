import { $, bound, setText } from '../dom.js';
import { formatNumber } from '../../utils/format.js';
import { ASSETS } from '../../config/assets.js';

/** End-of-run scoreboard. */
export class GameOverScreen {
  constructor({ profile, wallet }) {
    this.root = $('#screen-gameover');
    this.profile = profile;
    this.wallet = wallet;
  }

  populate({ score, coins, isBest, rank, height }) {
    const r = this.root;
    setText('result-score', formatNumber(score), r);
    setText('result-best', formatNumber(this.profile.bestScore), r);
    setText('result-height', formatNumber(height / 10), r);
    setText('result-coins', formatNumber(coins), r);
    setText('result-wallet', formatNumber(this.wallet.balance), r);

    const celebrate = isBest || rank === 1;
    setText('result-title', celebrate ? 'New Record!' : 'Game Over', r);
    bound('result-hero', r)[0].src = ASSETS.images[celebrate ? 'player.cheer' : 'player.hurt'];
    r.querySelector('.scoreboard').classList.toggle('is-record', celebrate);

    const badge = bound('result-badge', r)[0];
    if (rank > 0) {
      badge.hidden = false;
      badge.textContent =
        rank === 1 ? '🥇 #1 on the leaderboard!' : `🏆 Ranked #${rank} on the leaderboard`;
    } else {
      badge.hidden = true;
    }
  }
}
