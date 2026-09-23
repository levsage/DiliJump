/** Persisted user preferences. */
export class SettingsService {
  constructor(storage) {
    this.storage = storage;
    this.data = { muted: false, ...storage.get('settings', {}) };
  }

  get muted() {
    return this.data.muted;
  }

  toggleMuted() {
    this.data.muted = !this.data.muted;
    this.storage.set('settings', this.data);
    return this.data.muted;
  }
}
