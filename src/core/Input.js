/**
 * Unified input: keyboard, on-screen ◀ ▶ buttons, touch/pointer halves of the
 * screen and the on-screen shoot button. Exposes a simple polled state:
 *   input.axis  -> -1 | 0 | 1  (horizontal intent)
 *   input.consumeShoot() -> true once per shoot press
 */
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const SHOOT_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pointers = new Map(); // pointerId -> -1 | 1   (screen halves)
    this.buttonPointers = new Map(); // pointerId -> -1 | 0 | 1   (◀ ▶ buttons)
    this.buttonEls = [];
    this.shootQueued = false;
    this.onPause = null;
    this.enabled = true;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleBlur = () => this.reset();

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    target.addEventListener('pointerdown', this.handlePointerDown);
    target.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
  }

  get axis() {
    let a = 0;
    for (const k of this.keys) {
      if (LEFT_KEYS.has(k)) a -= 1;
      if (RIGHT_KEYS.has(k)) a += 1;
    }
    for (const dir of this.pointers.values()) a += dir;
    for (const dir of this.buttonPointers.values()) a += dir;
    return Math.sign(a);
  }

  queueShoot() {
    this.shootQueued = true;
  }

  consumeShoot() {
    const s = this.shootQueued;
    this.shootQueued = false;
    return s;
  }

  reset() {
    this.keys.clear();
    this.pointers.clear();
    this.buttonPointers.clear();
    this.shootQueued = false;
    this.refreshButtons();
  }

  /**
   * On-screen move buttons (`[data-dir="-1"|"1"]` inside `root`). Works with
   * touch and mouse, supports multi-touch, and a finger can slide from one
   * arrow to the other without lifting.
   */
  bindButtons(root) {
    this.buttonEls = [...root.querySelectorAll('[data-dir]')];
    const dirAt = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.('[data-dir]');
      return el && root.contains(el) ? Number(el.dataset.dir) : 0;
    };
    const set = (id, dir) => {
      this.buttonPointers.set(id, dir);
      this.refreshButtons();
    };
    const end = (e) => {
      if (!this.buttonPointers.delete(e.pointerId)) return;
      this.refreshButtons();
    };
    root.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest?.('[data-dir]');
      if (!btn || !this.enabled) return;
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      set(e.pointerId, Number(btn.dataset.dir));
    });
    root.addEventListener('pointermove', (e) => {
      if (this.buttonPointers.has(e.pointerId)) set(e.pointerId, dirAt(e.clientX, e.clientY));
    });
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('lostpointercapture', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menu
  }

  refreshButtons() {
    const active = new Set(this.buttonPointers.values());
    for (const el of this.buttonEls)
      el.classList.toggle('is-pressed', active.has(Number(el.dataset.dir)));
  }

  isTypingTarget(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  handleKeyDown(e) {
    if (this.isTypingTarget(e)) return;
    if (PAUSE_KEYS.has(e.code)) {
      this.onPause?.();
      return;
    }
    if (!this.enabled) return;
    if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code) || SHOOT_KEYS.has(e.code)) {
      e.preventDefault();
    }
    if (SHOOT_KEYS.has(e.code) && !e.repeat) this.queueShoot();
    this.keys.add(e.code);
  }

  handleKeyUp(e) {
    this.keys.delete(e.code);
  }

  sideOf(e) {
    const rect = this.target.getBoundingClientRect();
    return e.clientX - rect.left < rect.width / 2 ? -1 : 1;
  }

  handlePointerDown(e) {
    if (!this.enabled || e.pointerType === 'mouse') return;
    this.pointers.set(e.pointerId, this.sideOf(e));
  }

  handlePointerMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, this.sideOf(e));
  }

  handlePointerUp(e) {
    this.pointers.delete(e.pointerId);
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.target.removeEventListener('pointerdown', this.handlePointerDown);
    this.target.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
  }
}
