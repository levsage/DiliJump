/** Persisted user preferences. */
export class SettingsService {
  constructor(storage) {
    this.storage = storage;
    this.data = { muted: false, music: true, ...storage.get('settings', {}) };
  }

  get muted() {
    return this.data.muted;
  }

  get music() {
    return this.data.music;
  }

  toggleMusic() {
    this.data.music = !this.data.music;
    this.storage.set('settings', this.data);
    return this.data.music;
  }

  toggleMuted() {
    this.data.muted = !this.data.muted;
    this.storage.set('settings', this.data);
    return this.data.muted;
  }
}
