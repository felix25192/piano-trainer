import type { Key } from "./theory";

/**
 * Standard fingerings for the major scales.
 *
 * These are a table, not an algorithm. Two traditions decide them and they do
 * not reduce to one rule:
 *
 * - In C, G, D, A, E and B the right thumb takes the tonic and the fourth
 *   degree, both of which happen to be white keys.
 * - In the flat keys and in F sharp the right thumb takes the keys C and F
 *   wherever they fall, whatever they are called there — F sharp major spells
 *   them B and E sharp, and G flat major spells them C flat and F.
 *
 * What both traditions share, and what the tests in the file beside this one
 * check against the actual pitches, is that **the thumb never lands on a black
 * key**. A thumb is short; reaching it between two raised keys cramps the hand
 * and is the fastest way to build a habit that has to be unlearned later.
 *
 * Fingerings are keyed by the pitch class of the tonic, because enharmonic
 * keys are the same keys under the hand: F sharp major and G flat major are
 * played identically and only written differently.
 */

export interface HandFingering {
  /**
   * Right hand: the fingers for scale degrees 1 to 7, repeated once per
   * octave, with `top` closing on the final tonic.
   *
   * Left hand ascending: `start` takes the very first note and `unit` covers
   * degrees 2 to 8, repeated once per octave. The asymmetry is real — the
   * left hand uses its fifth finger only on the bottom note, the right hand
   * only on the top.
   */
  rh: { unit: number[]; top: number };
  lh: { start: number; unit: number[] };
}

/** Sharp-key shape: thumb on tonic and fourth degree. */
const SHARP_SHAPE: HandFingering = {
  rh: { unit: [1, 2, 3, 1, 2, 3, 4], top: 5 },
  lh: { start: 5, unit: [4, 3, 2, 1, 3, 2, 1] },
};

/** Flat-key shape: thumb on C and F, which the left hand mirrors onto G and D. */
const FLAT_LH = { start: 3, unit: [2, 1, 4, 3, 2, 1, 3] };

const MAJOR_FINGERINGS: Record<number, HandFingering> = {
  0: SHARP_SHAPE, // C
  7: SHARP_SHAPE, // G
  2: SHARP_SHAPE, // D
  9: SHARP_SHAPE, // A
  4: SHARP_SHAPE, // E

  // B: right hand as above, but the left thumb cannot take D sharp and moves
  // to E and B instead.
  11: {
    rh: { unit: [1, 2, 3, 1, 2, 3, 4], top: 5 },
    lh: { start: 4, unit: [3, 2, 1, 4, 3, 2, 1] },
  },

  // F sharp / G flat: the only key with no C or F natural. Both thumbs take
  // the two white keys that remain, B and E sharp.
  6: {
    rh: { unit: [2, 3, 4, 1, 2, 3, 1], top: 2 },
    lh: { start: 4, unit: [3, 2, 1, 3, 2, 1, 4] },
  },

  // F: tonic is white, so the right thumb starts on it and takes C as well.
  5: {
    rh: { unit: [1, 2, 3, 4, 1, 2, 3], top: 4 },
    lh: { start: 5, unit: [4, 3, 2, 1, 3, 2, 1] },
  },

  10: { rh: { unit: [4, 1, 2, 3, 1, 2, 3], top: 4 }, lh: FLAT_LH }, // B flat
  3: { rh: { unit: [3, 1, 2, 3, 4, 1, 2], top: 3 }, lh: FLAT_LH }, // E flat
  8: { rh: { unit: [3, 4, 1, 2, 3, 1, 2], top: 3 }, lh: FLAT_LH }, // A flat
  1: { rh: { unit: [2, 3, 1, 2, 3, 4, 1], top: 2 }, lh: FLAT_LH }, // D flat
};

/** Semitones above C for each natural letter. */
const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class of a key's tonic, so enharmonic spellings share a fingering. */
export function tonicPitchClass(key: Key): number {
  return (((SEMITONE[key.tonic] + key.tonicAlter) % 12) + 12) % 12;
}

/**
 * The fingering for a key, or null when none is offered.
 *
 * Minor scales return null for now. Their fingerings are not simply those of
 * the parallel or relative major — several keys break the thumb rule by
 * tradition — and publishing a guess would be worse than publishing nothing,
 * since a fingering practised wrongly is hard to unlearn. The exercises render
 * without finger numbers until each minor key has been checked.
 */
export function fingeringFor(key: Key): HandFingering | null {
  if (key.mode !== "major") return null;
  return MAJOR_FINGERINGS[tonicPitchClass(key)] ?? null;
}

export type Hand = "right" | "left";

/**
 * The finger for every note of an ascending scale over `octaves` octaves,
 * including the closing tonic.
 */
export function fingerSequence(
  fingering: HandFingering,
  hand: Hand,
  octaves: number,
): number[] {
  if (hand === "right") {
    const fingers: number[] = [];
    for (let i = 0; i < octaves; i++) fingers.push(...fingering.rh.unit);
    fingers.push(fingering.rh.top);
    return fingers;
  }

  const fingers: number[] = [fingering.lh.start];
  for (let i = 0; i < octaves; i++) fingers.push(...fingering.lh.unit);
  return fingers;
}
