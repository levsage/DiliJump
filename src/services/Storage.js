import { APP } from '../config/constants.js';

/** In-memory fallback (private mode, SSR, unit tests). */
export class MemoryBackend {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

function detectBackend() {
  try {
    const ls = globalThis.localStorage;
    const probe = `${APP.STORAGE_PREFIX}__probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryBackend();
  }
}

/** Namespaced, JSON-safe key/value storage. */
export class Storage {
  constructor(backend = detectBackend(), prefix = APP.STORAGE_PREFIX) {
    this.backend = backend;
    this.prefix = prefix;
  }

  get(key, fallback = null) {
    try {
      const raw = this.backend.getItem(this.prefix + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  set(key, value) {
    try {
      this.backend.setItem(this.prefix + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  remove(key) {
    this.backend.removeItem(this.prefix + key);
  }
}
