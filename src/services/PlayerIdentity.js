/**
 * Browser-only player identity — no login, no account.
 *
 *   playerId  public UUID (appears in leaderboard data)
 *   secret    random 192-bit token, proves "this browser owns playerId"
 *
 * Both are created on first use and kept in localStorage. The database only
 * ever stores sha256(secret). Clearing site data = a new player.
 */
const KEY = 'identity';

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function uuidV4() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const h = randomHex(16);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PlayerIdentity {
  constructor(storage) {
    this.storage = storage;
    this.cached = null;
  }

  static isValid(id) {
    return (
      Boolean(id) &&
      UUID_RE.test(id.playerId) &&
      typeof id.secret === 'string' &&
      id.secret.length >= 32
    );
  }

  /** @returns {{ playerId: string, secret: string }} */
  get() {
    if (this.cached) return this.cached;
    let id = this.storage.get(KEY);
    if (!PlayerIdentity.isValid(id)) {
      id = { playerId: uuidV4(), secret: randomHex(24), createdAt: Date.now() };
      this.storage.set(KEY, id);
    }
    this.cached = id;
    return id;
  }

  get playerId() {
    return this.get().playerId;
  }

  /** True once the database has accepted a score from this browser. */
  get registered() {
    return Boolean(this.get().registeredAt);
  }

  markRegistered() {
    if (this.registered) return;
    this.cached = { ...this.get(), registeredAt: Date.now() };
    this.storage.set(KEY, this.cached);
  }
}
