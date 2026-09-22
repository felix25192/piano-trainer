/**
 * The music theory the exercise generator needs: key signatures, scale
 * spelling, and the conversion to MIDI.
 *
 * Spelling is the point of this file. A scale is not a list of MIDI numbers —
 * in D major the third note is F sharp and never G flat, and in C sharp minor
 * the raised seventh is B sharp and never C. Notation has to say which, so
 * pitches are carried as letter, alteration and octave, and only flattened to
 * MIDI where the engine compares what was played.
 */

export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export interface Pitch {
  step: Letter;
  /** Semitone offset: -2 double flat, -1 flat, 0 natural, 1 sharp, 2 double sharp. */
  alter: number;
  /** Scientific octave, where middle C is C4. */
  octave: number;
}

export type Mode = "major" | "harmonicMinor";

export interface Key {
  tonic: Letter;
  /** Alteration of the tonic itself: F sharp major has tonic F with alter 1. */
  tonicAlter: number;
  mode: Mode;
  /** Position on the circle of fifths: 2 means two sharps, -3 three flats. */
  fifths: number;
}

const LETTERS: Letter[] = ["C", "D", "E", "F", "G", "A", "B"];

/** Semitones above C for each natural letter. */
const SEMITONE: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The order sharps appear in a key signature. */
const SHARP_ORDER: Letter[] = ["F", "C", "G", "D", "A", "E", "B"];
/** Flats appear in the reverse order. */
const FLAT_ORDER: Letter[] = ["B", "E", "A", "D", "G", "C", "F"];

/**
 * Which letters the key signature alters, and by how much.
 *
 * Six sharps alter F C G D A E; three flats alter B E A. Everything else
 * stays natural.
 */
export function keySignatureAlterations(fifths: number): Record<Letter, number> {
  const map: Record<Letter, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };

  if (fifths > 0) {
    for (const letter of SHARP_ORDER.slice(0, fifths)) map[letter] = 1;
  } else if (fifths < 0) {
    for (const letter of FLAT_ORDER.slice(0, -fifths)) map[letter] = -1;
  }

  return map;
}

/** MIDI note number, where middle C (C4) is 60. */
export function pitchToMidi(pitch: Pitch): number {
  return SEMITONE[pitch.step] + pitch.alter + (pitch.octave + 1) * 12;
}

/** True for a pitch that falls on a black key, whatever its spelling. */
export function isBlackKey(pitch: Pitch): boolean {
  const semitone = ((pitchToMidi(pitch) % 12) + 12) % 12;
  return [1, 3, 6, 8, 10].includes(semitone);
}

/** Readable form, e.g. "F#4" or "Bb3". Double accidentals repeat the sign. */
export function pitchToString(pitch: Pitch): string {
  const sign = pitch.alter > 0 ? "#".repeat(pitch.alter) : "b".repeat(-pitch.alter);
  return `${pitch.step}${sign}${pitch.octave}`;
}

/**
 * The seven letters of a scale, starting at the tonic.
 *
 * A scale uses each letter exactly once, which is what keeps the notation
 * readable — D major is D E F# G A B C#, never D E Gb G A B Db.
 */
function scaleLetters(tonic: Letter): Letter[] {
  const start = LETTERS.indexOf(tonic);
  return Array.from({ length: 7 }, (_, i) => LETTERS[(start + i) % 7]);
}

/**
 * One octave of a scale, from the tonic up to but not including the octave.
 *
 * For harmonic minor the seventh degree is raised by a semitone, which is what
 * gives the mode its leading note and its characteristic step of an augmented
 * second before it. The raise is applied to the alteration, not to the letter,
 * so C sharp minor correctly yields B sharp rather than C.
 */
export function scaleDegrees(key: Key, startOctave: number): Pitch[] {
  const signature = keySignatureAlterations(key.fifths);
  const letters = scaleLetters(key.tonic);

  let octave = startOctave;
  let previousIndex = LETTERS.indexOf(key.tonic);

  return letters.map((step, degree) => {
    const index = LETTERS.indexOf(step);
    // The octave number advances when the letters wrap past B to C.
    if (degree > 0 && index < previousIndex) octave += 1;
    previousIndex = index;

    const raised = key.mode === "harmonicMinor" && degree === 6 ? 1 : 0;
    return { step, alter: signature[step] + raised, octave };
  });
}

/**
 * A scale ascending over several octaves, closing on the tonic above.
 *
 * Two octaves therefore yield fifteen notes, not fourteen: a scale is played
 * up to its own tonic, and that closing note is what the fifth finger takes.
 */
export function ascendingScale(key: Key, startOctave: number, octaves: number): Pitch[] {
  const pitches: Pitch[] = [];
  for (let o = 0; o < octaves; o++) {
    pitches.push(...scaleDegrees(key, startOctave + o));
  }
  pitches.push(scaleDegrees(key, startOctave + octaves)[0]);
  return pitches;
}

/** Builds a key from its tonic and mode, deriving the signature. */
export function keyOf(tonic: Letter, tonicAlter: number, mode: Mode): Key {
  const fifths =
    mode === "major"
      ? majorFifths(tonic, tonicAlter)
      : // A minor key carries the signature of its relative major, a minor
        // third above — the raised seventh of harmonic minor is an accidental
        // in the music, not part of the signature.
        majorFifths(tonic, tonicAlter) - 3;

  return { tonic, tonicAlter, mode, fifths };
}

/** Circle-of-fifths position of a major key. C is 0, each fifth up adds one. */
function majorFifths(tonic: Letter, tonicAlter: number): number {
  // Fifths of the natural major keys: F(-1) C(0) G(1) D(2) A(3) E(4) B(5).
  const natural: Record<Letter, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
  // Each sharp on the tonic moves the key seven steps round the circle.
  return natural[tonic] + tonicAlter * 7;
}
