/** Tiny DOM helpers shared by UI modules. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** All elements bound to `data-bind="<key>"`. */
export const bound = (key, root = document) => $$(`[data-bind="${key}"]`, root);

/** Set textContent of every element bound to `key`. */
export const setText = (key, value, root = document) => {
  for (const el of bound(key, root)) el.textContent = value;
};

export const show = (el, visible = true) => {
  el.hidden = !visible;
};

/** Restart a CSS animation class on an element. */
export const pulse = (el, cls = 'is-pulse') => {
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow
  el.classList.add(cls);
};
