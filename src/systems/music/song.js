/**
 * "Sky High" — DiliJump's original background track (C major, 16 bars).
 *
 * Pure data, played by MusicPlayer. One bar = 16 steps (sixteenth notes).
 * Melody bars are written as `NOTE:steps` tokens; `R` is a rest.
 */
export const SONG = Object.freeze({
  bpm: 124,
  stepsPerBar: 16,

  /** One chord per bar: root note (for the bass) + chord tones (for the arpeggio). */
  chords: [
    // A section
    'C',
    'G',
    'Am',
    'F',
    'C',
    'G',
    'F',
    'G',
    // B section
    'Am',
    'F',
    'C',
    'G',
    'Am',
    'F',
    'G',
    'G',
  ],

  melody: [
    // A — bright, jumpy hook
    'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4',
    'D5:2 G5:2 B5:4 A5:2 G5:2 D5:4',
    'C5:2 E5:2 A5:4 G5:2 E5:2 C5:2 E5:2',
    'F5:4 A5:4 G5:2 F5:2 E5:2 D5:2',
    'E5:2 G5:2 C6:4 D6:2 C6:2 G5:4',
    'B5:2 A5:2 G5:4 D5:2 G5:2 B5:4',
    'A5:2 C6:2 F6:4 E6:2 D6:2 C6:2 A5:2',
    'B5:4 D6:4 G5:8',
    // B — climbing answer
    'A5:4 C6:2 A5:2 E5:4 A5:4',
    'F5:4 A5:2 C6:2 A5:4 F5:4',
    'G5:4 E5:2 G5:2 C6:4 E6:4',
    'D6:6 B5:2 G5:4 R:4',
    'A5:2 B5:2 C6:4 B5:2 A5:2 E5:4',
    'F5:2 G5:2 A5:4 G5:2 F5:2 C5:4',
    'D5:2 G5:2 B5:4 D6:2 B5:2 G5:4',
    'D6:4 C6:2 B5:2 A5:2 B5:2 D6:4',
  ],

  /** Drum grid per bar: k = kick, s = snare, h = closed hat, . = nothing. */
  drums: {
    kick: 'k...k...k...k.k.',
    snare: '....s.......s...',
    hat: 'h.h.h.h.h.h.h.h.',
    hat16: '.h.h.h.h.h.h.h.h',
  },
});

const CHORD_TONES = {
  C: ['C', 'E', 'G'],
  G: ['G', 'B', 'D'],
  Am: ['A', 'C', 'E'],
  F: ['F', 'A', 'C'],
};

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" → MIDI note number (C4 = 60). */
export function noteToMidi(note) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) throw new Error(`Bad note: ${note}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + acc;
}

export const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Parse one melody bar into `[{ step, len, midi|null }]`. */
export function parseBar(bar) {
  let step = 0;
  return bar
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [note, len] = token.split(':');
      const ev = { step, len: Number(len), midi: note === 'R' ? null : noteToMidi(note) };
      step += ev.len;
      return ev;
    });
}

/** Chord name → `{ root, tones }` as MIDI numbers around the given octave. */
export function chordNotes(name, octave = 4) {
  const tones = CHORD_TONES[name];
  if (!tones) throw new Error(`Unknown chord: ${name}`);
  const root = noteToMidi(`${tones[0]}${octave}`);
  const midi = tones.map((t) => {
    let n = noteToMidi(`${t}${octave}`);
    while (n < root) n += 12;
    return n;
  });
  return { root, tones: midi };
}
