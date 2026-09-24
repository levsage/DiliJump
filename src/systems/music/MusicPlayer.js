import { SONG, chordNotes, midiToFreq, parseBar } from './song.js';

/**
 * Procedural chiptune player (Web Audio). No audio files: every note is
 * synthesised on the fly with a look-ahead scheduler, so the whole soundtrack
 * costs a few KB of code.
 *
 * Intensity levels (cross-faded, per instrument):
 *   0  menu      bass + soft arpeggio + light hats
 *   1  playing   + drums + lead melody
 *   2  high up   + 16th hats + lead octave doubling
 */
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;
const FILTERED = new Set(['arp', 'lead']);

const LAYERS = {
  bass: [0.5, 0.6, 0.65],
  arp: [0.22, 0.16, 0.18],
  lead: [0, 0.34, 0.36],
  leadHi: [0, 0, 0.12],
  kick: [0, 0.7, 0.75],
  snare: [0, 0.4, 0.45],
  hat: [0.12, 0.2, 0.22],
  hat16: [0, 0, 0.14],
};

export class MusicPlayer {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.song = SONG;
    this.stepDur = 60 / SONG.bpm / 4;
    this.melody = SONG.melody.map(parseBar);
    this.chords = SONG.chords.map((c) => chordNotes(c, 3));
    this.totalSteps = SONG.chords.length * SONG.stepsPerBar;
    this.level = 0;
    this.playing = false;
    this.timer = null;

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(output);

    // soften the square-wave lead + arpeggio
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 3200;
    this.tone.connect(this.out);

    // one gain per layer so intensity changes cross-fade smoothly
    this.layers = {};
    for (const name of Object.keys(LAYERS)) {
      const g = ctx.createGain();
      g.gain.value = LAYERS[name][0];
      g.connect(FILTERED.has(name) ? this.tone : this.out);
      this.layers[name] = g;
    }

    this.noise = this.makeNoise();
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Start (or keep playing) at the given intensity level. */
  play(level = this.level, volume = 1) {
    this.setLevel(level);
    this.fadeTo(volume, 0.6);
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(fade = 0.5) {
    if (!this.playing) return;
    this.fadeTo(0, fade);
    const timer = this.timer;
    this.playing = false;
    setTimeout(
      () => {
        if (!this.playing) clearInterval(timer);
      },
      fade * 1000 + 50,
    );
  }

  setVolume(volume, fade = 0.4) {
    if (this.playing) this.fadeTo(volume, fade);
  }

  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    const t = this.ctx.currentTime;
    for (const [name, gains] of Object.entries(LAYERS)) {
      const g = this.layers[name].gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(gains[level], t, 0.35);
    }
  }

  fadeTo(volume, seconds) {
    const g = this.out.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(volume, t + seconds);
  }

  schedule() {
    if (!this.playing) return;
    // after a long stall (e.g. background tab) don't try to catch up
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % this.totalSteps;
      this.nextTime += this.stepDur;
    }
  }

  playStep(step, t) {
    const spb = this.song.stepsPerBar;
    const bar = Math.floor(step / spb);
    const s = step % spb;
    const chord = this.chords[bar];
    const d = this.stepDur;
    const { drums } = this.song;

    // bass: bouncing root / octave eighths, fifth as a pickup
    if (s % 2 === 0) {
      const octave = s % 4 === 2 ? 12 : 0;
      const note = s === 12 ? chord.tones[2] - 12 : chord.root - 12 + octave;
      this.voice('triangle', midiToFreq(note), t, d * 1.8, 0.55, this.layers.bass);
    }

    // arpeggio: chord tones rising in sixteenths, two octaves up
    const arpNote = chord.tones[s % 3] + 12 + (s % 6 >= 3 ? 12 : 0);
    this.voice('square', midiToFreq(arpNote), t, d * 0.8, 0.12, this.layers.arp);

    // lead melody (one octave down from the written line, it's a square wave)
    for (const ev of this.melody[bar]) {
      if (ev.step !== s || ev.midi === null) continue;
      const f = midiToFreq(ev.midi - 12);
      const len = ev.len * d * 0.92;
      this.voice('square', f, t, len, 0.22, this.layers.lead, true);
      this.voice('triangle', f * 2, t, len, 0.2, this.layers.leadHi);
    }

    if (drums.kick[s] === 'k') this.kick(t);
    if (drums.snare[s] === 's') this.snare(t);
    if (drums.hat[s] === 'h') this.hat(t, this.layers.hat);
    if (drums.hat16[s] === 'h') this.hat(t, this.layers.hat16);
  }

  voice(type, freq, t, dur, vol, dest, vibrato = false) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (vibrato && dur > 0.25) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * 0.008, t + dur);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  kick(t) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(this.layers.kick);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  noiseHit(t, dur, vol, type, freq, dest) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  snare(t) {
    this.noiseHit(t, 0.14, 0.5, 'bandpass', 1800, this.layers.snare);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(220, t);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(this.layers.snare);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  hat(t, dest) {
    this.noiseHit(t, 0.035, 0.35, 'highpass', 7500, dest);
  }
}
