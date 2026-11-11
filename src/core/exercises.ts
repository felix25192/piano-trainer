import { fingeringFor, fingerSequence, type Hand } from "./fingering";
import {
  ascendingScale,
  keyOf,
  scaleDegrees,
  type Key,
  type Letter,
  type Mode,
  type Pitch,
} from "./theory";

/**
 * Builds the notes of a practice exercise for both hands.
 *
 * Produces pitches and fingerings only — no rhythm, no notation, no XML. The
 * serialiser next door turns this into something OSMD can draw, and the engine
 * only ever sees the pitches. Keeping the three apart means the musical
 * decisions here can be tested without a browser.
 */

export type ExerciseKind = "scale" | "arpeggio" | "fiveFinger";

/**
 * Parallel: both hands play the same notes an octave apart, the way every
 * method book prints them.
 *
 * Contrary: both start on the same key, thumbs together, and move apart. It
 * sounds harder than it is — the hands mirror one another, so both use the
 * same finger numbers throughout even though the notes diverge.
 */
export type Motion = "parallel" | "contrary";

export interface ExerciseOptions {
  kind: ExerciseKind;
  key: Key;
  /** Octaves each hand covers. A five-finger exercise is always one position. */
  octaves: number;
  motion: Motion;
  /** Whether to attach finger numbers. Minor keys carry none either way. */
  fingerings: boolean;
}

export interface ExerciseNote {
  pitch: Pitch;
  finger?: number;
}

export interface Exercise {
  title: string;
  key: Key;
  /** Upper staff. Always the same length as `left`, so the two align note for note. */
  right: ExerciseNote[];
  left: ExerciseNote[];
}

/** Where the right hand starts. In parallel motion the left sits an octave below. */
const RIGHT_OCTAVE = 4;

export function buildExercise(options: ExerciseOptions): Exercise {
  const octaves = clampOctaves(options.kind, options.octaves);
  const contrary = options.motion === "contrary";

  return {
    title: titleOf(options, octaves),
    key: options.key,
    right: buildHand(options, "right", RIGHT_OCTAVE, octaves, false),
    left: buildHand(
      options,
      "left",
      // Contrary motion puts both thumbs on the same key; parallel motion
      // drops the left hand an octave.
      contrary ? RIGHT_OCTAVE : RIGHT_OCTAVE - 1,
      octaves,
      contrary,
    ),
  };
}

function clampOctaves(kind: ExerciseKind, octaves: number): number {
  if (kind === "fiveFinger") return 1;
  return Math.min(4, Math.max(1, Math.round(octaves)));
}

/** `descending` is what the left hand does first in contrary motion. */
function buildHand(
  options: ExerciseOptions,
  hand: Hand,
  startOctave: number,
  octaves: number,
  descending: boolean,
): ExerciseNote[] {
  switch (options.kind) {
    case "fiveFinger":
      return fiveFinger(options, hand, startOctave, descending);
    case "arpeggio":
      return arpeggio(options.key, startOctave, octaves, descending);
    case "scale":
      return scale(options, hand, startOctave, octaves, descending);
  }
}

function fiveFinger(
  options: ExerciseOptions,
  hand: Hand,
  startOctave: number,
  descending: boolean,
): ExerciseNote[] {
  const pitches = descending
    ? descendingFrom(options.key, startOctave, 5)
    : scaleDegrees(options.key, startOctave).slice(0, 5);

  /*
   * No thumb crossing here, so the fingers simply fan outwards from whichever
   * finger sits on the starting note. Moving away from the thumb that is
   * 1..5; moving towards it, 5..1. The left hand ascending is the only case
   * that starts at the little finger.
   */
  const outwards = hand === "right" || descending;
  const fingers = outwards ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];

  const out = pitches.map((pitch, i) => ({
    pitch,
    finger: options.fingerings ? fingers[i] : undefined,
  }));

  return outAndBack(out);
}

function scale(
  options: ExerciseOptions,
  hand: Hand,
  startOctave: number,
  octaves: number,
  descending: boolean,
): ExerciseNote[] {
  const fingering = options.fingerings ? fingeringFor(options.key) : null;
  const ascendingFingers = fingering ? fingerSequence(fingering, hand, octaves) : null;

  const pitches = descending
    ? descendingFrom(options.key, startOctave, octaves * 7 + 1)
    : ascendingScale(options.key, startOctave, octaves);

  // Going down, the hand does the same thing backwards.
  const fingers =
    descending && ascendingFingers ? [...ascendingFingers].reverse() : ascendingFingers;

  return outAndBack(pitches.map((pitch, i) => ({ pitch, finger: fingers?.[i] })));
}

/**
 * Broken triad over the given octaves: degrees 1, 3 and 5 of each, closing on
 * the tonic above.
 *
 * Carries no fingerings. Arpeggio fingering depends on the inversion and on
 * how far the hand has to stretch, and is not the single standard pattern a
 * scale has.
 */
function arpeggio(
  key: Key,
  startOctave: number,
  octaves: number,
  descending: boolean,
): ExerciseNote[] {
  const notes: ExerciseNote[] = [];
  for (let o = 0; o < octaves; o++) {
    const degrees = scaleDegrees(key, startOctave + o);
    notes.push({ pitch: degrees[0] }, { pitch: degrees[2] }, { pitch: degrees[4] });
  }
  notes.push({ pitch: scaleDegrees(key, startOctave + octaves)[0] });

  if (!descending) return outAndBack(notes);

  // Mirror the whole figure below the starting note instead of above it.
  const lowered = notes.map(({ pitch }) => ({
    pitch: { ...pitch, octave: pitch.octave - octaves },
  }));
  return outAndBack([...lowered].reverse());
}

/** Plays a figure out and back, sounding the turning note only once. */
function outAndBack(notes: ExerciseNote[]): ExerciseNote[] {
  return [...notes, ...notes.slice(0, -1).reverse()];
}

/** The scale running downwards from a starting note, `count` notes long. */
function descendingFrom(key: Key, startOctave: number, count: number): Pitch[] {
  const octavesBelow = Math.ceil(count / 7);
  const below = ascendingScale(key, startOctave - octavesBelow, octavesBelow);
  return below.reverse().slice(0, count);
}

const KIND_NAMES: Record<ExerciseKind, string> = {
  scale: "Tonleiter",
  arpeggio: "Arpeggio",
  fiveFinger: "Fünf-Finger-Übung",
};

function titleOf(options: ExerciseOptions, octaves: number): string {
  const parts = [`${KIND_NAMES[options.kind]} ${keyName(options.key)}`];
  if (options.kind !== "fiveFinger") {
    parts.push(octaves === 1 ? "1 Oktave" : `${octaves} Oktaven`);
  }
  if (options.motion === "contrary") parts.push("Gegenbewegung");
  return parts.join(" · ");
}

/**
 * German note names, which follow no rule worth deriving.
 *
 * B flat is "B" and B natural is "H", a survival of a medieval scribal habit.
 * E flat is "Es" and A flat "As" rather than the regular "Ees" and "Aes",
 * because German swallows the vowel. Everything else takes -is or -es.
 */
const GERMAN_NOTE: Record<string, string> = {
  "C-1": "Ces", "C0": "C", "C1": "Cis",
  "D-1": "Des", "D0": "D", "D1": "Dis",
  "E-1": "Es",  "E0": "E", "E1": "Eis",
  "F-1": "Fes", "F0": "F", "F1": "Fis",
  "G-1": "Ges", "G0": "G", "G1": "Gis",
  "A-1": "As",  "A0": "A", "A1": "Ais",
  "B-1": "B",   "B0": "H", "B1": "His",
};

/** e.g. "D-Dur", "Es-Dur", "h-Moll", "b-Moll". */
export function keyName(key: Key): string {
  const note = GERMAN_NOTE[`${key.tonic}${key.tonicAlter}`] ?? key.tonic;
  // Minor keys are written in lower case in German.
  return key.mode === "major" ? `${note}-Dur` : `${note.toLowerCase()}-Moll`;
}

/*
 * The keys offered, in circle-of-fifths order: C, then one sharp more each
 * step, wrapping round through the flats back to F.
 *
 * Twelve of each, and the minor list holds the relative minor of the major
 * beside it. Spelled the way they are normally written, which costs one
 * enharmonic step: F sharp major stands beside E flat minor, the relative of
 * its twin G flat major. D sharp minor would be the strict answer, but it
 * takes six sharps and then raises its seventh to C double sharp; E flat minor
 * takes six flats and a plain D natural.
 */
const MAJOR_TONICS: Array<[Letter, number]> = [
  ["C", 0], ["G", 0], ["D", 0], ["A", 0], ["E", 0], ["B", 0],
  ["F", 1], ["D", -1], ["A", -1], ["E", -1], ["B", -1], ["F", 0],
];

const MINOR_TONICS: Array<[Letter, number]> = [
  ["A", 0], ["E", 0], ["B", 0], ["F", 1], ["C", 1], ["G", 1],
  ["E", -1], ["B", -1], ["F", 0], ["C", 0], ["G", 0], ["D", 0],
];

export const MAJOR_KEYS: readonly Key[] = MAJOR_TONICS.map(([t, a]) => keyOf(t, a, "major"));
export const MINOR_KEYS: readonly Key[] = MINOR_TONICS.map(([t, a]) => keyOf(t, a, "harmonicMinor"));

const KINDS: readonly ExerciseKind[] = ["scale", "arpeggio", "fiveFinger"];
const MOTIONS: readonly Motion[] = ["parallel", "contrary"];
const MODES: readonly Mode[] = ["major", "harmonicMinor"];

/**
 * An exercise written as a short string, e.g. "ex:scale:D:0:major:2:parallel:true".
 *
 * This is how the last exercise survives a reload: nothing is stored but the
 * key, and the exercise is simply built again from it. The format is
 * therefore fixed — a key an older version saved must still open the same
 * exercise.
 */
export function exerciseKey(options: ExerciseOptions): string {
  const { kind, key, octaves, motion, fingerings } = options;
  return `ex:${kind}:${key.tonic}:${key.tonicAlter}:${key.mode}:${octaves}:${motion}:${fingerings}`;
}

/**
 * Reads a key from `exerciseKey` back, or returns null.
 *
 * Refuses what it does not recognise rather than guessing: a key that is not
 * among the offered ones, an octave count outside one to four, a word it does
 * not know. Whatever comes out of storage is opened as an exercise, and a
 * guessed one would be an exercise nobody chose.
 */
export function parseExerciseKey(text: string): ExerciseOptions | null {
  const parts = text.split(":");
  if (parts.length !== 8 || parts[0] !== "ex") return null;
  const [, kind, tonic, alter, mode, octaves, motion, fingerings] = parts;

  if (!includes(KINDS, kind) || !includes(MOTIONS, motion) || !includes(MODES, mode)) return null;
  if (fingerings !== "true" && fingerings !== "false") return null;

  const count = Number(octaves);
  if (!Number.isInteger(count) || count < 1 || count > 4) return null;

  const offered = mode === "major" ? MAJOR_KEYS : MINOR_KEYS;
  const key = offered.find((k) => k.tonic === tonic && String(k.tonicAlter) === alter);
  if (!key) return null;

  return { kind, key, octaves: count, motion, fingerings: fingerings === "true" };
}

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}
