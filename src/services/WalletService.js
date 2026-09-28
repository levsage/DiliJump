/**
 * DLI coin wallet. Tracks the coins collected in the current run and the
 * player's lifetime balance (persisted locally).
 */
export class WalletService {
  constructor(storage) {
    this.storage = storage;
    const saved = storage.get('wallet', {});
    this.balance = Number.isFinite(saved.balance) ? saved.balance : 0;
    this.lifetime = Number.isFinite(saved.lifetime) ? saved.lifetime : 0;
    this.runCoins = 0;
  }

  startRun() {
    this.runCoins = 0;
  }

  add(amount = 1) {
    this.runCoins += amount;
    return this.runCoins;
  }

  /** Moves the run's coins into the persistent balance. */
  commitRun() {
    const earned = this.runCoins;
    this.balance += earned;
    this.lifetime += earned;
    this.save();
    return earned;
  }

  /**
   * Pays from the persistent balance (Dressing Room purchases).
   * @returns {boolean} false (and nothing spent) when the balance is too low
   */
  spend(amount) {
    if (!Number.isInteger(amount) || amount < 0 || amount > this.balance) return false;
    this.balance -= amount;
    this.save();
    return true;
  }

  /** Gives coins back to the persistent balance (e.g. for a retired skin). */
  refund(amount) {
    if (!Number.isInteger(amount) || amount <= 0) return;
    this.balance += amount;
    this.save();
  }

  save() {
    this.storage.set('wallet', { balance: this.balance, lifetime: this.lifetime });
  }
}
