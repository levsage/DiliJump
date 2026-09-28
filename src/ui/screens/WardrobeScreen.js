import { $, bound, setText } from '../dom.js';
import { formatNumber } from '../../utils/format.js';
import { SKINS, getSkin, skinPoseScale, skinPoseUrl } from '../../config/skins.js';

/** How long a "Confirm?" purchase button waits for the second tap. */
const CONFIRM_MS = 4000;

/**
 * Dressing Room: preview, buy (with DLI coins) and wear character skins.
 *
 * Buying takes two taps (price → "Confirm") so nobody spends coins by
 * accident; a skin you can't afford shows how many DLI are still missing.
 * A bought skin is worn right away. Wearing a skin may need to download its
 * artwork first, so `onEquip(id)` is async and the button shows progress.
 */
export class WardrobeScreen {
  constructor({ skins, wallet, onEquip, onPurchase = () => {} }) {
    this.root = $('#screen-wardrobe');
    this.skins = skins;
    this.wallet = wallet;
    this.onEquip = onEquip;
    this.onPurchase = onPurchase;
    this.list = bound('wardrobe-list', this.root)[0];
    this.preview = bound('wardrobe-preview', this.root)[0];
    this.coinSrc = document.querySelector('.coinbar__icon')?.getAttribute('src') ?? '';
    this.selected = skins.equipped;
    this.confirming = null;
    this.confirmTimer = null;
    this.busy = null; // skin id currently loading
    this.error = null;

    this.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-skin-action]');
      const card = e.target.closest('[data-skin]');
      if (btn) this.act(btn.dataset.skinAction, btn.dataset.skin);
      else if (card) this.select(card.dataset.skin);
    });
  }

  open() {
    this.selected = this.skins.equipped;
    this.error = null;
    this.render();
  }

  close() {
    this.cancelConfirm();
  }

  select(id) {
    if (!getSkin(id)) return;
    this.selected = id;
    this.render();
  }

  async act(action, id) {
    this.selected = id;
    this.error = null;
    if (action === 'buy') {
      this.cancelConfirm();
      this.confirming = id;
      this.confirmTimer = setTimeout(() => this.cancelConfirm(true), CONFIRM_MS);
      return this.render();
    }
    if (action === 'confirm') {
      this.cancelConfirm();
      const res = this.skins.buy(id);
      if (!res.ok) {
        this.error = res.reason === 'funds' ? 'Not enough DLI.' : null;
        return this.render();
      }
      this.onPurchase(id);
      return this.equip(id);
    }
    if (action === 'equip') return this.equip(id);
    return undefined;
  }

  async equip(id) {
    this.busy = id;
    this.render();
    try {
      await this.onEquip(id);
      this.skins.equip(id);
    } catch (err) {
      console.warn('[skins] could not load', id, err.message);
      this.error = 'Could not load this skin. Check your connection and try again.';
    }
    this.busy = null;
    this.render();
  }

  cancelConfirm(rerender = false) {
    clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
    const was = this.confirming;
    this.confirming = null;
    if (rerender && was) this.render();
  }

  /** Label/state of a card's button. */
  buttonFor(skin) {
    const { id, price } = skin;
    if (this.busy === id) return { text: 'Loading…', disabled: true, kind: 'busy' };
    if (this.skins.equipped === id) return { text: '✓ Wearing', disabled: true, kind: 'worn' };
    if (this.skins.owns(id)) return { text: 'Wear', action: 'equip', kind: 'wear' };
    if (this.confirming === id) return { text: 'Confirm ✓', action: 'confirm', kind: 'confirm' };
    const missing = this.skins.missing(id);
    if (missing > 0) {
      return { text: `Need ${formatNumber(missing)} more`, disabled: true, kind: 'locked' };
    }
    return { text: formatNumber(price), action: 'buy', kind: 'buy', coin: true };
  }

  render() {
    const r = this.root;
    setText('wardrobe-wallet', formatNumber(this.wallet.balance), r);
    const sel = getSkin(this.selected) ?? getSkin(this.skins.equipped);
    this.preview.src = skinPoseUrl(sel.id, 'idle');
    this.preview.style.setProperty('--sprite-h', String(skinPoseScale(sel.id, 'idle')));
    this.preview.alt = sel.name;
    setText('wardrobe-name', sel.name, r);
    setText('wardrobe-tagline', sel.tagline, r);
    const err = bound('wardrobe-error', r)[0];
    err.textContent = this.error ?? '';
    err.hidden = !this.error;

    this.list.replaceChildren(...SKINS.map((skin) => this.card(skin)));
  }

  card(skin) {
    const li = document.createElement('li');
    li.className = 'skin-card';
    li.dataset.skin = skin.id;
    li.classList.toggle('is-selected', skin.id === this.selected);
    li.classList.toggle('is-worn', skin.id === this.skins.equipped);
    li.classList.toggle('is-owned', this.skins.owns(skin.id));

    const img = document.createElement('img');
    img.className = 'skin-card__img';
    img.src = skinPoseUrl(skin.id, 'idle');
    img.alt = '';
    img.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'skin-card__info';
    const name = document.createElement('b');
    name.textContent = skin.name;
    const price = document.createElement('small');
    price.textContent =
      skin.price === 0 ? 'Free' : this.skins.owns(skin.id) ? 'Owned' : `${skin.price} DLI`;
    info.append(name, price);

    const b = this.buttonFor(skin);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skin-card__btn skin-card__btn--${b.kind}`;
    btn.disabled = Boolean(b.disabled);
    if (b.action) {
      btn.dataset.skinAction = b.action;
      btn.dataset.skin = skin.id;
    }
    if (b.coin && this.coinSrc) {
      const coin = document.createElement('img');
      coin.src = this.coinSrc;
      coin.alt = 'DLI';
      btn.append(coin);
    }
    btn.append(document.createTextNode(b.text));

    li.append(img, info, btn);
    return li;
  }
}
