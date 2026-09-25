import { bound, setText } from './dom.js';
import { formatNumber } from '../utils/format.js';

/** Short badge text, e.g. "Lv 7". */
export function levelLabel(level) {
  return `Lv ${formatNumber(level)}`;
}

/**
 * Fill an XP bar rendered with `data-bind="<prefix>-level|-fill|-text"`.
 * @param {HTMLElement} root
 * @param {string} prefix
 * @param {ReturnType<import('../systems/PlayerLevel.js').levelProgress>} p
 * @param {string} [text] overrides the "into / needed XP" label
 */
export function renderXpBar(root, prefix, p, text) {
  setText(`${prefix}-level`, formatNumber(p.level), root);
  const fill = bound(`${prefix}-fill`, root)[0];
  if (fill) fill.style.width = `${(Math.min(1, Math.max(0, p.progress)) * 100).toFixed(1)}%`;
  setText(`${prefix}-text`, text ?? `${formatNumber(p.into)} / ${formatNumber(p.needed)} XP`, root);
}
