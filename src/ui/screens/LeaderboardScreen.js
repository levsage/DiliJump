import { $, bound } from '../dom.js';
import { escapeHtml, formatDate, formatNumber } from '../../utils/format.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const STATUS_TEXT = {
  local: 'Offline · this device',
  connecting: 'Connecting…',
  live: 'LIVE',
  online: 'Online · auto-refresh',
  error: 'Offline · retrying',
};
const POLL_MS = 15000;

/**
 * Leaderboard panel. One row per person (their best score). When backed by
 * Supabase it listens to realtime changes while open and refreshes itself.
 */
export class LeaderboardScreen {
  constructor({ leaderboard, profile }) {
    this.root = $('#screen-leaderboard');
    this.leaderboard = leaderboard;
    this.profile = profile;
    this.list = bound('leaderboard', this.root)[0];
    this.empty = bound('leaderboard-empty', this.root)[0];
    this.me = bound('leaderboard-me', this.root)[0];
    this.status = bound('leaderboard-status', this.root)[0];
    this.unsubscribe = null;
    this.pollTimer = null;
    this.realtime = 'connecting';
    this.dataOk = false;
    this.requestId = 0;
    this.coinSrc = document.querySelector('.coinbar__icon')?.getAttribute('src') ?? '';
  }

  setStatus(kind) {
    this.status.dataset.status = kind;
    this.status.textContent = STATUS_TEXT[kind];
  }

  /** Status shown = realtime state combined with whether data loads. */
  updateStatus() {
    if (this.leaderboard.mode === 'local') return this.setStatus('local');
    if (!this.dataOk && this.realtime !== 'connecting') return this.setStatus('error');
    if (this.realtime === 'live') return this.setStatus('live');
    return this.setStatus(this.dataOk ? 'online' : 'connecting');
  }

  /** Called when the panel opens. */
  open() {
    this.dataOk = false;
    this.realtime = 'connecting';
    this.updateStatus();
    if (this.leaderboard.mode !== 'local') {
      this.unsubscribe = this.leaderboard.subscribe(
        () => this.refresh({ quiet: true }),
        (status) => {
          this.realtime =
            status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' ? 'connecting' : 'down';
          this.updateStatus();
        },
      );
      // Fallback when realtime is blocked (proxies, disabled replication…).
      this.pollTimer = setInterval(() => {
        if (this.realtime !== 'live') this.refresh({ quiet: true });
      }, POLL_MS);
    }
    this.refresh();
  }

  close() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async refresh({ quiet = false } = {}) {
    const id = ++this.requestId;
    if (!quiet) this.root.classList.add('is-loading');
    this.leaderboard.setCurrentName(this.profile.name);
    try {
      const [entries, mine] = await Promise.all([
        this.leaderboard.top(),
        this.leaderboard.myEntry(),
      ]);
      if (id !== this.requestId) return; // a newer refresh won
      this.render(entries, mine);
      this.dataOk = true;
      this.updateStatus();
    } catch (err) {
      if (id !== this.requestId) return;
      console.warn('[leaderboard]', err);
      this.dataOk = false;
      this.setStatus('error');
      if (!quiet) this.render([], null, 'Could not load the leaderboard. Check your connection.');
    } finally {
      if (id === this.requestId) this.root.classList.remove('is-loading');
    }
  }

  row(e, extraClass = '') {
    const place = MEDALS[e.rank - 1] ?? `${e.rank}`;
    return `
      <li class="lb-row${e.isMe ? ' is-me' : ''}${extraClass}">
        <span class="lb-row__rank">${place}</span>
        <span class="lb-row__name"><span>${escapeHtml(e.name)}${e.isMe ? ' <em>(you)</em>' : ''}</span><small>${formatDate(e.date)}</small></span>
        <span class="lb-row__coins"><img src="${this.coinSrc}" alt="" />${formatNumber(e.coins ?? 0)}</span>
        <span class="lb-row__score">${formatNumber(e.score)}</span>
      </li>`;
  }

  render(entries, mine, emptyText = 'No scores yet — be the first!') {
    this.empty.hidden = entries.length > 0;
    this.empty.textContent = emptyText;
    this.list.innerHTML = entries.map((e) => this.row(e)).join('');

    // Player outside the top list → show their own rank below it.
    const inList = entries.some((e) => e.isMe);
    this.me.hidden = !mine || inList;
    this.me.innerHTML = mine && !inList ? this.row({ ...mine, isMe: true }, ' lb-row--me') : '';
  }
}
