/**
 * Pitch arithmetic. Pure functions over MIDI note numbers — no browser, no
 * audio, no notation library. Everything downstream speaks MIDI numbers, so
 * this is the narrowest possible vocabulary the rest of the core needs.
 */

/** Lowest key on an 88-key piano (A0). */
export const PIANO_LOWEST = 21;
/** Highest key on an 88-key piano (C8). */
export const PIANO_HIGHEST = 108;

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** Semitone offsets of the natural notes within an octave. */
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export type Spelling = "sharp" | "flat";

/**
 * Renders a MIDI number as scientific pitch notation, e.g. 61 → "C#4".
 *
 * MIDI 60 is C4 and MIDI 69 is A4 (440 Hz), which fixes the octave offset at
 * -1. Beware: some hardware vendors label MIDI 60 as C3 instead. We follow the
 * scientific convention throughout.
 */
export function midiToName(midi: number, spelling: Spelling = "sharp"): string {
  assertInteger(midi);
  const names = spelling === "flat" ? FLAT_NAMES : SHARP_NAMES;
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[pitchClass]}${octave}`;
}

/**
 * Parses scientific pitch notation into a MIDI number, e.g. "Bb3" → 58.
 * Accepts `#`/`s` for sharps and `b` for flats, and negative octaves.
 */
export function nameToMidi(name: string): number {
  const match = /^([A-Ga-g])([#sb]*)(-?\d+)$/.exec(name.trim());
  if (!match) throw new RangeError(`Not a pitch name: "${name}"`);

  const [, letter, accidentals, octaveText] = match;
  const base = NATURALS[letter.toUpperCase()];

  let offset = 0;
  for (const ch of accidentals) offset += ch === "b" ? -1 : 1;

  return base + offset + (Number(octaveText) + 1) * 12;
}

/** True when the note exists on a standard 88-key piano. */
export function isOnPiano(midi: number): boolean {
  return Number.isInteger(midi) && midi >= PIANO_LOWEST && midi <= PIANO_HIGHEST;
}

/** Equal-tempered frequency in Hz, with A4 = 440 Hz. Needed by the microphone adapter. */
export function midiToFrequency(midi: number, concertPitch = 440): number {
  assertInteger(midi);
  return concertPitch * Math.pow(2, (midi - 69) / 12);
}

/**
 * Nearest MIDI number to a measured frequency, plus how far off it was in
 * cents. The microphone adapter uses the deviation to reject pitches that are
 * merely close — a note 45 cents flat is more likely a detection artefact than
 * a deliberate note.
 */
export function frequencyToMidi(
  hz: number,
  concertPitch = 440,
): { midi: number; cents: number } {
  if (!(hz > 0)) throw new RangeError(`Frequency must be positive, got ${hz}`);
  const exact = 69 + 12 * Math.log2(hz / concertPitch);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}

/** Distance in semitones, ignoring direction. */
export function interval(a: number, b: number): number {
  return Math.abs(a - b);
}

function assertInteger(midi: number): void {
  if (!Number.isInteger(midi)) {
    throw new RangeError(`MIDI note must be an integer, got ${midi}`);
  }
}
