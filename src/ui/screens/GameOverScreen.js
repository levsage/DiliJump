import { $, bound, setText } from '../dom.js';
import { formatNumber } from '../../utils/format.js';
import { ASSETS } from '../../config/assets.js';
import { levelProgress } from '../../systems/PlayerLevel.js';
import { renderXpBar } from '../levelView.js';

/** End-of-run scoreboard. Re-populated when the leaderboard rank arrives. */
export class GameOverScreen {
  constructor({ profile, wallet }) {
    this.root = $('#screen-gameover');
    this.profile = profile;
    this.wallet = wallet;
  }

  populate({ score, coins, isBest, rank, height, pending, online, queued, ...lvl }) {
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

    this.populateLevel({ score, ...lvl });

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

  /** "+score XP", the level bar and — when earned — the LEVEL UP banner. */
  populateLevel({ score, totalScore, level, prevLevel, levelUp }) {
    const r = this.root;
    const p = levelProgress(totalScore ?? this.profile.totalScore);
    renderXpBar(r, 'result-xp', p, `+${formatNumber(Math.max(0, score ?? 0))} XP`);
    const banner = bound('result-levelup', r)[0];
    const up = Boolean(levelUp) && level > prevLevel;
    if (up && banner.dataset.level !== String(level)) {
      const gained = level - prevLevel;
      banner.textContent = `⭐ LEVEL UP! Level ${formatNumber(level)}${gained > 1 ? ` (+${gained})` : ''}`;
      banner.dataset.level = String(level);
      banner.classList.remove('is-pop');
      void banner.offsetWidth; // restart the pop animation
      banner.classList.add('is-pop');
    }
    banner.hidden = !up;
    if (!up) delete banner.dataset.level;
    r.querySelector('.scoreboard__level').classList.toggle('is-levelup', up);
  }
}
