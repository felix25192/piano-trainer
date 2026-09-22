import { describe, expect, it } from "vitest";
import { buildExercise, keyName, type ExerciseOptions } from "./exercises";
import { keyOf, pitchToMidi, pitchToString } from "./theory";

function options(over: Partial<ExerciseOptions> = {}): ExerciseOptions {
  return {
    kind: "scale",
    key: keyOf("C", 0, "major"),
    octaves: 1,
    motion: "parallel",
    fingerings: true,
    ...over,
  };
}

const names = (notes: { pitch: Parameters<typeof pitchToString>[0] }[]) =>
  notes.map((n) => pitchToString(n.pitch)).join(" ");

const fingers = (notes: { finger?: number }[]) => notes.map((n) => n.finger);

describe("scales", () => {
  it("runs up and back, sounding the top note once", () => {
    const { right } = buildExercise(options());
    expect(names(right)).toBe("C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4 C4");
  });

  it("puts the left hand an octave below in parallel motion", () => {
    const { left } = buildExercise(options());
    expect(names(left)).toBe("C3 D3 E3 F3 G3 A3 B3 C4 B3 A3 G3 F3 E3 D3 C3");
  });

  it("keeps the hands the same length so they align note for note", () => {
    for (const octaves of [1, 2, 3, 4]) {
      for (const motion of ["parallel", "contrary"] as const) {
        const { right, left } = buildExercise(options({ octaves, motion }));
        expect(right).toHaveLength(left.length);
        // Up and back over n octaves: 7n + 1 notes each way, turning note once.
        expect(right).toHaveLength((octaves * 7 + 1) * 2 - 1);
      }
    }
  });

  it("carries the standard fingering, reversed on the way down", () => {
    const { right } = buildExercise(options());
    expect(fingers(right)).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]);
  });

  it("leaves the fingers off when they are not wanted", () => {
    const { right, left } = buildExercise(options({ fingerings: false }));
    expect(fingers(right).every((f) => f === undefined)).toBe(true);
    expect(fingers(left).every((f) => f === undefined)).toBe(true);
  });

  it("leaves minor unfingered, since those are not settled yet", () => {
    const { right } = buildExercise(
      options({ key: keyOf("A", 0, "harmonicMinor"), fingerings: true }),
    );
    expect(fingers(right).every((f) => f === undefined)).toBe(true);
    // The notes are still correct, raised seventh and all.
    expect(names(right)).toBe("A4 B4 C5 D5 E5 F5 G#5 A5 G#5 F5 E5 D5 C5 B4 A4");
  });

  it("spells the notes by the key, not by the keyboard", () => {
    const { right } = buildExercise(options({ key: keyOf("F", 1, "major") }));
    expect(names(right).startsWith("F#4 G#4 A#4 B4 C#5 D#5 E#5 F#5")).toBe(true);
  });
});

describe("contrary motion", () => {
  it("starts both hands on the same note", () => {
    const { right, left } = buildExercise(options({ motion: "contrary" }));
    expect(pitchToString(right[0].pitch)).toBe("C4");
    expect(pitchToString(left[0].pitch)).toBe("C4");
  });

  it("sends them in opposite directions", () => {
    const { right, left } = buildExercise(options({ motion: "contrary" }));
    expect(pitchToMidi(right[1].pitch)).toBeGreaterThan(pitchToMidi(right[0].pitch));
    expect(pitchToMidi(left[1].pitch)).toBeLessThan(pitchToMidi(left[0].pitch));
  });

  it("gives both hands the same fingers, which is why it feels easy", () => {
    const { right, left } = buildExercise(options({ motion: "contrary" }));
    expect(fingers(left)).toEqual(fingers(right));
    expect(fingers(right)[0]).toBe(1); // both thumbs on the shared note
  });

  it("brings both hands home together", () => {
    const { right, left } = buildExercise(options({ motion: "contrary", octaves: 2 }));
    expect(pitchToString(right[right.length - 1].pitch)).toBe("C4");
    expect(pitchToString(left[left.length - 1].pitch)).toBe("C4");
  });
});

describe("five-finger exercises", () => {
  it("stays in one hand position, up and back", () => {
    const { right } = buildExercise(options({ kind: "fiveFinger" }));
    expect(names(right)).toBe("C4 D4 E4 F4 G4 F4 E4 D4 C4");
    expect(fingers(right)).toEqual([1, 2, 3, 4, 5, 4, 3, 2, 1]);
  });

  it("starts the left hand on its little finger when it ascends", () => {
    const { left } = buildExercise(options({ kind: "fiveFinger" }));
    expect(names(left)).toBe("C3 D3 E3 F3 G3 F3 E3 D3 C3");
    expect(fingers(left)).toEqual([5, 4, 3, 2, 1, 2, 3, 4, 5]);
  });

  it("fans both thumbs outwards in contrary motion", () => {
    const { right, left } = buildExercise(options({ kind: "fiveFinger", motion: "contrary" }));
    expect(names(right)).toBe("C4 D4 E4 F4 G4 F4 E4 D4 C4");
    expect(names(left)).toBe("C4 B3 A3 G3 F3 G3 A3 B3 C4");
    expect(fingers(left)).toEqual([1, 2, 3, 4, 5, 4, 3, 2, 1]);
  });

  it("ignores the octave count, being one position by definition", () => {
    const { right } = buildExercise(options({ kind: "fiveFinger", octaves: 4 }));
    expect(right).toHaveLength(9);
  });
});

describe("arpeggios", () => {
  it("breaks the triad and closes on the octave", () => {
    const { right } = buildExercise(options({ kind: "arpeggio" }));
    expect(names(right)).toBe("C4 E4 G4 C5 G4 E4 C4");
  });

  it("stacks further octaves on top", () => {
    const { right } = buildExercise(options({ kind: "arpeggio", octaves: 2 }));
    expect(names(right)).toBe("C4 E4 G4 C5 E5 G5 C6 G5 E5 C5 G4 E4 C4");
  });

  it("takes the third from the key, so minor sounds minor", () => {
    const { right } = buildExercise(
      options({ kind: "arpeggio", key: keyOf("A", 0, "harmonicMinor") }),
    );
    expect(names(right)).toBe("A4 C5 E5 A5 E5 C5 A4");
  });

  it("mirrors downwards from the shared note in contrary motion", () => {
    const { right, left } = buildExercise(options({ kind: "arpeggio", motion: "contrary" }));
    expect(pitchToString(left[0].pitch)).toBe(pitchToString(right[0].pitch));
    expect(names(left)).toBe("C4 G3 E3 C3 E3 G3 C4");
  });
});

describe("octave range", () => {
  it("accepts one to four and refuses nonsense", () => {
    expect(buildExercise(options({ octaves: 0 })).right).toHaveLength(15);
    expect(buildExercise(options({ octaves: 9 })).right).toHaveLength(57);
    expect(buildExercise(options({ octaves: 2.4 })).right).toHaveLength(29);
  });
});

describe("German key names", () => {
  it("follows the conventions that have no rule", () => {
    // B flat is B and B natural is H — a medieval scribal habit that stuck.
    expect(keyName(keyOf("B", -1, "major"))).toBe("B-Dur");
    expect(keyName(keyOf("B", 0, "major"))).toBe("H-Dur");
    // German swallows the vowel in these two.
    expect(keyName(keyOf("E", -1, "major"))).toBe("Es-Dur");
    expect(keyName(keyOf("A", -1, "major"))).toBe("As-Dur");
  });

  it("takes the regular endings elsewhere", () => {
    expect(keyName(keyOf("D", 0, "major"))).toBe("D-Dur");
    expect(keyName(keyOf("F", 1, "major"))).toBe("Fis-Dur");
    expect(keyName(keyOf("D", -1, "major"))).toBe("Des-Dur");
  });

  it("writes minor keys in lower case", () => {
    expect(keyName(keyOf("A", 0, "harmonicMinor"))).toBe("a-Moll");
    expect(keyName(keyOf("B", 0, "harmonicMinor"))).toBe("h-Moll");
    expect(keyName(keyOf("B", -1, "harmonicMinor"))).toBe("b-Moll");
    expect(keyName(keyOf("F", 1, "harmonicMinor"))).toBe("fis-Moll");
    expect(keyName(keyOf("E", -1, "harmonicMinor"))).toBe("es-Moll");
  });
});

describe("titles", () => {
  it("names what it is", () => {
    expect(buildExercise(options({ octaves: 2 })).title).toBe("Tonleiter C-Dur · 2 Oktaven");
    expect(buildExercise(options({ kind: "fiveFinger" })).title).toBe(
      "Fünf-Finger-Übung C-Dur",
    );
    expect(buildExercise(options({ motion: "contrary" })).title).toBe(
      "Tonleiter C-Dur · 1 Oktave · Gegenbewegung",
    );
  });
});
