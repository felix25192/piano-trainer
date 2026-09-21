import { describe, expect, it } from "vitest";
import {
  frequencyToMidi,
  isOnPiano,
  midiToFrequency,
  midiToName,
  nameToMidi,
  PIANO_HIGHEST,
  PIANO_LOWEST,
} from "./pitch";

describe("midiToName", () => {
  it("follows the scientific convention where MIDI 60 is C4", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(69)).toBe("A4");
  });

  it("names the outer keys of an 88-key piano", () => {
    expect(midiToName(PIANO_LOWEST)).toBe("A0");
    expect(midiToName(PIANO_HIGHEST)).toBe("C8");
  });

  it("spells black keys as sharps by default and as flats on request", () => {
    expect(midiToName(61)).toBe("C#4");
    expect(midiToName(61, "flat")).toBe("Db4");
    expect(midiToName(58, "flat")).toBe("Bb3");
  });

  it("names the opening chord of the Moonlight Sonata", () => {
    // Right hand starts the triplet on G#3, left hand holds the C#2/C#3 octave.
    expect(midiToName(56)).toBe("G#3");
    expect(midiToName(37)).toBe("C#2");
    expect(midiToName(49)).toBe("C#3");
  });

  it("rejects non-integers rather than inventing a quarter tone", () => {
    expect(() => midiToName(60.5)).toThrow(RangeError);
  });
});

describe("nameToMidi", () => {
  it("round-trips every note on the piano", () => {
    for (let midi = PIANO_LOWEST; midi <= PIANO_HIGHEST; midi++) {
      expect(nameToMidi(midiToName(midi))).toBe(midi);
      expect(nameToMidi(midiToName(midi, "flat"))).toBe(midi);
    }
  });

  it("accepts both accidental spellings for the same key", () => {
    expect(nameToMidi("C#4")).toBe(nameToMidi("Db4"));
    expect(nameToMidi("Cs4")).toBe(61);
  });

  it("handles lower case and surrounding whitespace", () => {
    expect(nameToMidi("  a4 ")).toBe(69);
  });

  it("throws on anything that is not a pitch name", () => {
    expect(() => nameToMidi("H4")).toThrow(RangeError);
    expect(() => nameToMidi("C")).toThrow(RangeError);
    expect(() => nameToMidi("")).toThrow(RangeError);
  });
});

describe("isOnPiano", () => {
  it("draws the boundary exactly at A0 and C8", () => {
    expect(isOnPiano(PIANO_LOWEST - 1)).toBe(false);
    expect(isOnPiano(PIANO_LOWEST)).toBe(true);
    expect(isOnPiano(PIANO_HIGHEST)).toBe(true);
    expect(isOnPiano(PIANO_HIGHEST + 1)).toBe(false);
  });
});

describe("frequency conversion", () => {
  it("anchors A4 at 440 Hz and halves it an octave down", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(57)).toBeCloseTo(220, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
  });

  it("honours a different concert pitch", () => {
    expect(midiToFrequency(69, 442)).toBeCloseTo(442, 6);
  });

  it("maps a measured frequency back to the nearest key", () => {
    expect(frequencyToMidi(440)).toEqual({ midi: 69, cents: 0 });
    expect(frequencyToMidi(261.6256)).toMatchObject({ midi: 60 });
  });

  it("reports how far off a detuned note was", () => {
    const { midi, cents } = frequencyToMidi(440 * Math.pow(2, 40 / 1200));
    expect(midi).toBe(69);
    expect(cents).toBe(40);
  });

  it("rounds a pitch sitting exactly between two keys upwards", () => {
    // 50 cents is the midpoint, where neither key is the better answer.
    // Math.round breaks the tie towards the higher one; pinning that here so
    // the behaviour is a decision rather than an accident. The microphone
    // adapter should reject anything this far off anyway.
    expect(frequencyToMidi(440 * Math.pow(2, 50 / 1200))).toEqual({
      midi: 70,
      cents: -50,
    });
  });

  it("survives a round trip through frequency for every piano key", () => {
    for (let m = PIANO_LOWEST; m <= PIANO_HIGHEST; m++) {
      expect(frequencyToMidi(midiToFrequency(m)).midi).toBe(m);
    }
  });

  it("rejects a frequency of zero or below", () => {
    expect(() => frequencyToMidi(0)).toThrow(RangeError);
    expect(() => frequencyToMidi(-100)).toThrow(RangeError);
  });
});
