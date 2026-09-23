import { $, setText } from '../dom.js';
import { formatNumber } from '../../utils/format.js';
import { ProfileService } from '../../services/ProfileService.js';
import { APP } from '../../config/constants.js';

/** Main menu with the custom player-name editor and wallet summary. */
export class MenuScreen {
  constructor({ profile, wallet, onNameChange }) {
    this.root = $('#screen-menu');
    this.profile = profile;
    this.wallet = wallet;
    this.form = $('[data-form="name"]', this.root);
    this.input = $('#name-input', this.root);
    this.onNameChange = onNameChange;

    setText('version', APP.VERSION, this.root);

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveName();
      this.input.blur();
    });
    this.input.addEventListener('input', () => {
      setText('name-error', '', this.root);
      this.form.classList.remove('is-saved');
    });
    this.input.addEventListener('blur', () => {
      if (this.input.value.trim()) this.saveName({ silent: true });
    });
  }

  /** @returns {boolean} whether a valid name is now set */
  saveName({ silent = false } = {}) {
    const raw = this.input.value;
    const result = ProfileService.validateName(raw);
    if (!result.ok) {
      if (!silent) setText('name-error', result.error, this.root);
      return false;
    }
    const oldName = this.profile.data.name;
    this.profile.setName(result.name);
    this.input.value = result.name;
    this.form.classList.add('is-saved');
    setText('name-error', '', this.root);
    if (oldName !== result.name) this.onNameChange?.(result.name, oldName);
    return true;
  }

  /** Ensure a name exists before playing; focus the field otherwise. */
  ensureName() {
    if (this.input.value.trim() && this.input.value.trim() !== this.profile.data.name) {
      return this.saveName();
    }
    if (this.profile.hasName) return true;
    setText('name-error', 'Please enter your name to play', this.root);
    this.input.focus();
    return false;
  }

  refresh() {
    this.input.value = this.profile.data.name;
    this.form.classList.toggle('is-saved', this.profile.hasName);
    setText('menu-best', formatNumber(this.profile.bestScore), this.root);
    setText('wallet', formatNumber(this.wallet.balance), this.root);
    setText('games', formatNumber(this.profile.gamesPlayed), this.root);
  }
}
