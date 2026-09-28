/** Loads images declared in the asset manifest, reporting progress. */
export class AssetLoader {
  constructor() {
    this.images = new Map();
    this.pending = new Map();
  }

  /** Load with a couple of retries — one flaky request must not break the game. */
  async loadImage(key, src, retries = 2) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.loadOnce(key, src);
      } catch (err) {
        if (attempt >= retries) throw err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  loadOnce(key, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.images.set(key, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load asset "${key}" (${src})`));
      img.src = src;
    });
  }

  /** Loads every image of a manifest; keys already loaded (or loading) are reused. */
  async loadAll(manifest, onProgress = () => {}) {
    const entries = Object.entries(manifest.images);
    let done = 0;
    await Promise.all(
      entries.map(([key, src]) =>
        this.request(key, src).then(() => onProgress(++done / entries.length)),
      ),
    );
    return this;
  }

  request(key, src) {
    if (this.images.has(key)) return Promise.resolve(this.images.get(key));
    if (!this.pending.has(key)) {
      const p = this.loadImage(key, src).finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    return this.pending.get(key);
  }

  has(key) {
    return this.images.has(key);
  }

  get(key) {
    const img = this.images.get(key);
    if (!img) throw new Error(`Asset "${key}" not loaded`);
    return img;
  }
}
