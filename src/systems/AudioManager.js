import { MusicPlayer } from './music/MusicPlayer.js';

const MASTER_VOLUME = 0.35;
const MUSIC_VOLUME = 0.5;

/**
 * Procedural sound effects + background music via the Web Audio API — no
 * audio files needed, keeping the download tiny. The context is lazily
 * created on the first user gesture to satisfy browser autoplay policies.
 *
 *   master (mute) ─┬─ sfx
 *                  └─ music (on/off) ← MusicPlayer
 */
export class AudioManager {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicEnabled = music;
    this.musicMode = { level: 0, volume: 1 };
    this.ctx = null;
    this.master = null;
    this.music = null;
  }

  get unlocked() {
    return Boolean(this.ctx);
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = MUSIC_VOLUME;
    this.musicBus.connect(this.master);
    this.music = new MusicPlayer(this.ctx, this.musicBus);
    this.applyMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master)
      this.master.gain.setTargetAtTime(m ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.05);
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    this.applyMusic();
  }

  /** Desired soundtrack state: intensity level (0 menu, 1 play, 2 high) and volume. */
  setMusicMode(level, volume = 1) {
    this.musicMode = { level, volume };
    this.applyMusic();
  }

  applyMusic() {
    if (!this.music) return;
    const { level, volume } = this.musicMode;
    if (this.musicEnabled && volume > 0) this.music.play(level, volume);
    else this.music.stop();
  }

  /** Pause everything while the tab is hidden. */
  suspend() {
    if (this.ctx?.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  tone({ freq = 440, to = freq, dur = 0.12, type = 'sine', vol = 0.6, delay = 0 }) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  jump() {
    this.tone({ freq: 320, to: 640, dur: 0.12, type: 'triangle', vol: 0.45 });
  }
  spring() {
    this.tone({ freq: 200, to: 1200, dur: 0.35, type: 'square', vol: 0.2 });
  }
  coin() {
    this.tone({ freq: 988, dur: 0.07, type: 'square', vol: 0.18 });
    this.tone({ freq: 1319, dur: 0.16, type: 'square', vol: 0.18, delay: 0.07 });
  }
  shoot() {
    this.tone({ freq: 900, to: 300, dur: 0.1, type: 'sawtooth', vol: 0.15 });
  }
  /** Soft thud when bumping into a side wall. */
  bump() {
    this.tone({ freq: 150, to: 70, dur: 0.09, type: 'triangle', vol: 0.35 });
  }
  crack() {
    this.tone({ freq: 180, to: 60, dur: 0.18, type: 'sawtooth', vol: 0.3 });
  }
  stomp() {
    this.tone({ freq: 500, to: 120, dur: 0.2, type: 'square', vol: 0.25 });
  }
  hit() {
    this.tone({ freq: 400, to: 80, dur: 0.5, type: 'sawtooth', vol: 0.3 });
  }
  gameOver() {
    [523, 392, 330, 262].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.4, delay: i * 0.16 }),
    );
  }
  highScore() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.18, type: 'square', vol: 0.18, delay: i * 0.1 }),
    );
  }
  levelUp() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.14, type: 'triangle', vol: 0.3, delay: i * 0.07 }),
    );
  }
}
