import { $, bound } from '../dom.js';
import { escapeHtml, formatDate, formatNumber } from '../../utils/format.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Top-10 local leaderboard, highlighting the current player's entries. */
export class LeaderboardScreen {
  constructor({ leaderboard, profile }) {
    this.root = $('#screen-leaderboard');
    this.leaderboard = leaderboard;
    this.profile = profile;
    this.list = bound('leaderboard', this.root)[0];
    this.empty = bound('leaderboard-empty', this.root)[0];
  }

  refresh() {
    const entries = this.leaderboard.top();
    this.empty.hidden = entries.length > 0;
    this.list.innerHTML = entries
      .map((e, i) => {
        const me = e.name === this.profile.name ? ' is-me' : '';
        const place = MEDALS[i] ?? `${i + 1}`;
        return `
        <li class="lb-row${me}">
          <span class="lb-row__rank">${place}</span>
          <span class="lb-row__name">${escapeHtml(e.name)}<small>${formatDate(e.date)}</small></span>
          <span class="lb-row__coins"><img src="${this.coinSrc()}" alt="" />${formatNumber(e.coins ?? 0)}</span>
          <span class="lb-row__score">${formatNumber(e.score)}</span>
        </li>`;
      })
      .join('');
  }

  coinSrc() {
    return document.querySelector('.coinbar__icon')?.getAttribute('src') ?? '';
  }
}
