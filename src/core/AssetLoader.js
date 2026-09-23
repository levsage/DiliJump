/** Loads images declared in the asset manifest, reporting progress. */
export class AssetLoader {
  constructor() {
    this.images = new Map();
  }

  loadImage(key, src) {
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

  async loadAll(manifest, onProgress = () => {}) {
    const entries = Object.entries(manifest.images);
    let done = 0;
    await Promise.all(
      entries.map(([key, src]) =>
        this.loadImage(key, src).then(() => onProgress(++done / entries.length)),
      ),
    );
    return this;
  }

  get(key) {
    const img = this.images.get(key);
    if (!img) throw new Error(`Asset "${key}" not loaded`);
    return img;
  }
}
