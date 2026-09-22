import { describe, expect, it } from "vitest";
import {
  isBlackKey,
  keyOf,
  keySignatureAlterations,
  pitchToMidi,
  pitchToString,
  scaleDegrees,
  type Letter,
} from "./theory";

/** Renders a scale as "C D E F G A B" for readable assertions. */
function spell(tonic: Letter, alter: number, mode: "major" | "harmonicMinor", octave = 4) {
  return scaleDegrees(keyOf(tonic, alter, mode), octave)
    .map((p) => pitchToString(p).replace(/\d+$/, ""))
    .join(" ");
}

describe("key signatures", () => {
  it("places sharps in the order F C G D A E B", () => {
    expect(keySignatureAlterations(1)).toMatchObject({ F: 1, C: 0 });
    expect(keySignatureAlterations(3)).toMatchObject({ F: 1, C: 1, G: 1, D: 0 });
    expect(keySignatureAlterations(7)).toMatchObject({
      F: 1, C: 1, G: 1, D: 1, A: 1, E: 1, B: 1,
    });
  });

  it("places flats in the reverse order B E A D G C F", () => {
    expect(keySignatureAlterations(-1)).toMatchObject({ B: -1, E: 0 });
    expect(keySignatureAlterations(-4)).toMatchObject({ B: -1, E: -1, A: -1, D: -1, G: 0 });
  });

  it("leaves everything natural in C major", () => {
    expect(keySignatureAlterations(0)).toEqual({ C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 });
  });

  it("derives the signature from tonic and mode", () => {
    expect(keyOf("C", 0, "major").fifths).toBe(0);
    expect(keyOf("D", 0, "major").fifths).toBe(2);
    expect(keyOf("B", -1, "major").fifths).toBe(-2);
    expect(keyOf("F", 1, "major").fifths).toBe(6);

    // A minor key carries the signature of its relative major, a third above.
    expect(keyOf("A", 0, "harmonicMinor").fifths).toBe(0);
    expect(keyOf("E", 0, "harmonicMinor").fifths).toBe(1);
    expect(keyOf("C", 1, "harmonicMinor").fifths).toBe(4);
  });
});

describe("major scale spelling", () => {
  it("spells the plain keys", () => {
    expect(spell("C", 0, "major")).toBe("C D E F G A B");
    expect(spell("G", 0, "major")).toBe("G A B C D E F#");
    expect(spell("D", 0, "major")).toBe("D E F# G A B C#");
    expect(spell("F", 0, "major")).toBe("F G A Bb C D E");
  });

  it("uses every letter exactly once, which is what forces E sharp", () => {
    // F sharp major must not spell its seventh as F — that letter is taken.
    expect(spell("F", 1, "major")).toBe("F# G# A# B C# D# E#");
  });

  it("spells C flat where the letter demands it", () => {
    // G flat major's fourth is C flat, not B, for the same reason.
    expect(spell("G", -1, "major")).toBe("Gb Ab Bb Cb Db Eb F");
  });

  it("handles the far ends of the circle", () => {
    expect(spell("C", 1, "major")).toBe("C# D# E# F# G# A# B#");
    expect(spell("C", -1, "major")).toBe("Cb Db Eb Fb Gb Ab Bb");
  });
});

describe("harmonic minor spelling", () => {
  it("raises the seventh degree", () => {
    expect(spell("A", 0, "harmonicMinor")).toBe("A B C D E F G#");
    expect(spell("D", 0, "harmonicMinor")).toBe("D E F G A Bb C#");
  });

  it("raises the alteration, not the letter — hence B sharp", () => {
    // C sharp minor's leading note is B sharp. Spelling it C would put two
    // C's in one scale and make the notation unreadable.
    expect(spell("C", 1, "harmonicMinor")).toBe("C# D# E F# G# A B#");
  });

  it("produces a double sharp where the key requires one", () => {
    // G sharp minor has five sharps; raising its seventh turns F sharp into
    // F double sharp. Any implementation that works in MIDI numbers gets G
    // natural here and renders nonsense.
    expect(spell("G", 1, "harmonicMinor")).toBe("G# A# B C# D# E F##");
  });

  it("keeps the augmented second before the leading note", () => {
    const degrees = scaleDegrees(keyOf("A", 0, "harmonicMinor"), 4);
    const sixth = pitchToMidi(degrees[5]);
    const seventh = pitchToMidi(degrees[6]);
    // F to G sharp is three semitones — the sound of the mode.
    expect(seventh - sixth).toBe(3);
  });
});

describe("octaves", () => {
  it("stays in one octave for a scale starting on C", () => {
    const degrees = scaleDegrees(keyOf("C", 0, "major"), 4);
    expect(degrees.map((p) => p.octave)).toEqual([4, 4, 4, 4, 4, 4, 4]);
  });

  it("steps up when the letters wrap past B", () => {
    const degrees = scaleDegrees(keyOf("A", 0, "major"), 3);
    expect(degrees.map((p) => pitchToString(p))).toEqual([
      "A3", "B3", "C#4", "D4", "E4", "F#4", "G#4",
    ]);
  });
});

describe("MIDI conversion", () => {
  it("anchors middle C at 60", () => {
    expect(pitchToMidi({ step: "C", alter: 0, octave: 4 })).toBe(60);
    expect(pitchToMidi({ step: "A", alter: 0, octave: 4 })).toBe(69);
  });

  it("maps enharmonic spellings to the same key", () => {
    expect(pitchToMidi({ step: "C", alter: 1, octave: 4 })).toBe(
      pitchToMidi({ step: "D", alter: -1, octave: 4 }),
    );
    // B sharp is the C above it, not the C beside it.
    expect(pitchToMidi({ step: "B", alter: 1, octave: 3 })).toBe(60);
    expect(pitchToMidi({ step: "C", alter: -1, octave: 4 })).toBe(59);
  });

  it("handles double accidentals", () => {
    expect(pitchToMidi({ step: "F", alter: 2, octave: 4 })).toBe(67);
  });
});

describe("black keys", () => {
  it("knows the five black keys of an octave", () => {
    expect(isBlackKey({ step: "C", alter: 1, octave: 4 })).toBe(true);
    expect(isBlackKey({ step: "B", alter: -1, octave: 4 })).toBe(true);
    expect(isBlackKey({ step: "C", alter: 0, octave: 4 })).toBe(false);
    expect(isBlackKey({ step: "E", alter: 0, octave: 4 })).toBe(false);
  });

  it("goes by the key struck, not by the accidental in the name", () => {
    // These all carry an accidental but land on white keys — which is exactly
    // what the thumb rule for fingerings turns on.
    expect(isBlackKey({ step: "E", alter: 1, octave: 4 })).toBe(false); // = F
    expect(isBlackKey({ step: "C", alter: -1, octave: 4 })).toBe(false); // = B
    expect(isBlackKey({ step: "B", alter: 1, octave: 4 })).toBe(false); // = C
    expect(isBlackKey({ step: "F", alter: -1, octave: 4 })).toBe(false); // = E
  });
});
