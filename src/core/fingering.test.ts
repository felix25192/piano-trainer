import { describe, expect, it } from "vitest";
import { fingeringFor, fingerSequence, tonicPitchClass, type Hand } from "./fingering";
import { ascendingScale, isBlackKey, keyOf, pitchToString, type Letter } from "./theory";

/**
 * The fingering table is data, and data can be mistyped. So rather than
 * asserting the sequences back at themselves, these tests check the table
 * against the pitches it will actually be used on, using the rules a piano
 * teacher would apply.
 */

/** Every major key, spelled the way it is normally written. */
const MAJOR_KEYS: Array<[Letter, number, string]> = [
  ["C", 0, "C"],
  ["G", 0, "G"],
  ["D", 0, "D"],
  ["A", 0, "A"],
  ["E", 0, "E"],
  ["B", 0, "B"],
  ["F", 1, "F#"],
  ["G", -1, "Gb"],
  ["D", -1, "Db"],
  ["A", -1, "Ab"],
  ["E", -1, "Eb"],
  ["B", -1, "Bb"],
  ["F", 0, "F"],
];

const HANDS: Hand[] = ["right", "left"];

describe("coverage", () => {
  it("offers a fingering for every major key", () => {
    for (const [tonic, alter, name] of MAJOR_KEYS) {
      const fingering = fingeringFor(keyOf(tonic, alter, "major"));
      expect(fingering, `${name} major`).not.toBeNull();
    }
  });

  it("withholds one for minor rather than guessing", () => {
    expect(fingeringFor(keyOf("A", 0, "harmonicMinor"))).toBeNull();
    expect(fingeringFor(keyOf("C", 1, "harmonicMinor"))).toBeNull();
  });

  it("treats enharmonic keys as the same keys under the hand", () => {
    // F sharp major and G flat major are played identically.
    expect(tonicPitchClass(keyOf("F", 1, "major"))).toBe(
      tonicPitchClass(keyOf("G", -1, "major")),
    );
    expect(fingeringFor(keyOf("F", 1, "major"))).toBe(fingeringFor(keyOf("G", -1, "major")));
  });
});

describe("the thumb never lands on a black key", () => {
  // The rule that decides scale fingering: the thumb is short, and reaching it
  // between two raised keys cramps the hand. Every standard fingering obeys
  // it, so a violation here means the table is wrong.
  for (const [tonic, alter, name] of MAJOR_KEYS) {
    for (const hand of HANDS) {
      it(`${name} major, ${hand} hand`, () => {
        const key = keyOf(tonic, alter, "major");
        const fingering = fingeringFor(key);
        expect(fingering).not.toBeNull();

        const pitches = ascendingScale(key, 4, 2);
        const fingers = fingerSequence(fingering!, hand, 2);
        expect(fingers).toHaveLength(pitches.length);

        const offenders = pitches
          .map((pitch, i) => ({ pitch, finger: fingers[i] }))
          .filter(({ pitch, finger }) => finger === 1 && isBlackKey(pitch))
          .map(({ pitch }) => pitchToString(pitch));

        expect(offenders).toEqual([]);
      });
    }
  }
});

describe("shape of the sequences", () => {
  it("has one finger per note, closing tonic included", () => {
    for (const [tonic, alter, name] of MAJOR_KEYS) {
      const key = keyOf(tonic, alter, "major");
      const fingering = fingeringFor(key)!;
      for (const octaves of [1, 2, 4]) {
        for (const hand of HANDS) {
          expect(
            fingerSequence(fingering, hand, octaves).length,
            `${name}, ${hand}, ${octaves} octaves`,
          ).toBe(octaves * 7 + 1);
        }
      }
    }
  });

  it("uses only the five fingers of a hand", () => {
    for (const [tonic, alter, name] of MAJOR_KEYS) {
      const fingering = fingeringFor(keyOf(tonic, alter, "major"))!;
      for (const hand of HANDS) {
        for (const finger of fingerSequence(fingering, hand, 2)) {
          expect(finger, `${name}, ${hand}`).toBeGreaterThanOrEqual(1);
          expect(finger, `${name}, ${hand}`).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it("never asks the same finger for two notes in a row", () => {
    // Which would mean sliding a finger sideways rather than playing a scale.
    for (const [tonic, alter, name] of MAJOR_KEYS) {
      const fingering = fingeringFor(keyOf(tonic, alter, "major"))!;
      for (const hand of HANDS) {
        const fingers = fingerSequence(fingering, hand, 3);
        for (let i = 1; i < fingers.length; i++) {
          expect(fingers[i], `${name}, ${hand}, position ${i}`).not.toBe(fingers[i - 1]);
        }
      }
    }
  });

  it("saves the fifth finger for the outer note, if it uses it at all", () => {
    // Ascending, the right hand reaches its fifth only on the top note and the
    // left hand only on the bottom one. Keys starting on a black note never
    // get there — F sharp major closes on the second finger.
    for (const [tonic, alter, name] of MAJOR_KEYS) {
      const fingering = fingeringFor(keyOf(tonic, alter, "major"))!;

      const right = fingerSequence(fingering, "right", 2);
      const rightFifths = right.flatMap((f, i) => (f === 5 ? [i] : []));
      expect(rightFifths.length, `${name}, right`).toBeLessThanOrEqual(1);
      if (rightFifths.length === 1) expect(rightFifths[0]).toBe(right.length - 1);

      const left = fingerSequence(fingering, "left", 2);
      const leftFifths = left.flatMap((f, i) => (f === 5 ? [i] : []));
      expect(leftFifths.length, `${name}, left`).toBeLessThanOrEqual(1);
      if (leftFifths.length === 1) expect(leftFifths[0]).toBe(0);
    }
  });
});

describe("the fingerings themselves", () => {
  it("gives C major the pattern every method book opens with", () => {
    const fingering = fingeringFor(keyOf("C", 0, "major"))!;
    expect(fingerSequence(fingering, "right", 1)).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(fingerSequence(fingering, "left", 1)).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });

  it("starts B flat major on the fourth finger, because B flat is black", () => {
    const fingering = fingeringFor(keyOf("B", -1, "major"))!;
    expect(fingerSequence(fingering, "right", 1)).toEqual([4, 1, 2, 3, 1, 2, 3, 4]);
  });

  it("carries the thumb across correctly over several octaves", () => {
    const fingering = fingeringFor(keyOf("C", 0, "major"))!;
    expect(fingerSequence(fingering, "right", 2)).toEqual([
      1, 2, 3, 1, 2, 3, 4, // first octave
      1, 2, 3, 1, 2, 3, 4, // second
      5, // closing tonic
    ]);
    expect(fingerSequence(fingering, "left", 2)).toEqual([
      5, // bottom note, taken once
      4, 3, 2, 1, 3, 2, 1,
      4, 3, 2, 1, 3, 2, 1,
    ]);
  });
});
