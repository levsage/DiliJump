import { VIEW, CAMERA } from '../config/constants.js';

/** Upward-only follow camera with screen-shake. `y` is the world Y of the view's top edge. */
export class Camera {
  constructor() {
    this.reset(0);
  }

  reset(y) {
    this.y = y;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  follow(targetY) {
    const line = this.y + VIEW.HEIGHT * CAMERA.FOLLOW_LINE;
    if (targetY < line) this.y = targetY - VIEW.HEIGHT * CAMERA.FOLLOW_LINE;
  }

  shake(magnitude = 8, duration = 0.3) {
    this.shakeMag = magnitude;
    this.shakeT = duration;
  }

  update(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.max(0, this.shakeT / 0.3);
      this.offsetX = (Math.random() - 0.5) * m * 2;
      this.offsetY = (Math.random() - 0.5) * m * 2;
    } else {
      this.offsetX = this.offsetY = 0;
    }
  }

  get bottom() {
    return this.y + VIEW.HEIGHT;
  }
}
