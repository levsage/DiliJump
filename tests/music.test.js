import { describe, expect, it } from 'vitest';
import { SONG, chordNotes, midiToFreq, noteToMidi, parseBar } from '../src/systems/music/song.js';

describe('background music data', () => {
  it('has one chord per melody bar', () => {
    expect(SONG.melody).toHaveLength(SONG.chords.length);
  });

  it('every melody bar is exactly one bar long', () => {
    SONG.melody.forEach((bar, i) => {
      const total = parseBar(bar).reduce((n, ev) => n + ev.len, 0);
      expect(total, `bar ${i + 1}`).toBe(SONG.stepsPerBar);
    });
  });

  it('every drum pattern is one bar long', () => {
    for (const p of Object.values(SONG.drums)) expect(p).toHaveLength(SONG.stepsPerBar);
  });

  it('parses notes and chords', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#3')).toBe(54);
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(parseBar('C5:4 R:12')).toEqual([
      { step: 0, len: 4, midi: 72 },
      { step: 4, len: 12, midi: null },
    ]);
    expect(chordNotes('Am', 3)).toEqual({ root: 57, tones: [57, 60, 64] });
    for (const c of SONG.chords) expect(() => chordNotes(c)).not.toThrow();
  });

  it('loops in a sensible length (15-60 s)', () => {
    const seconds = (SONG.chords.length * SONG.stepsPerBar * 60) / SONG.bpm / 4;
    expect(seconds).toBeGreaterThan(15);
    expect(seconds).toBeLessThan(60);
  });
});
