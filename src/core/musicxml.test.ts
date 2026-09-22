import { describe, expect, it } from "vitest";
import { buildExercise, type ExerciseOptions } from "./exercises";
import { exerciseToMusicXml } from "./musicxml";
import { keyOf } from "./theory";

function xmlFor(over: Partial<ExerciseOptions> = {}): string {
  return exerciseToMusicXml(
    buildExercise({
      kind: "scale",
      key: keyOf("C", 0, "major"),
      octaves: 1,
      motion: "parallel",
      fingerings: true,
      ...over,
    }),
  );
}

/** The XML of one measure, counting from 1. */
function measureXml(xml: string, number: number): string {
  const parts = xml.split(/<measure number="\d+">/);
  return parts[number] ?? "";
}

/**
 * The upper staff of a measure — everything before the rewind.
 *
 * Accidentals are tracked per staff, because a sign in the treble says
 * nothing about the bass. Looking at one hand at a time is what makes the
 * once-per-bar rule testable.
 */
function rightHandOf(measure: string): string {
  return measure.split("<backup>")[0];
}

/** How often a substring occurs. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("document structure", () => {
  it("declares itself as partwise MusicXML", () => {
    const xml = xmlFor();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<score-partwise version=");
    expect(xml).toContain("</score-partwise>");
  });

  it("sets up a grand staff once, in the first measure", () => {
    const xml = xmlFor();
    expect(count(xml, "<staves>2</staves>")).toBe(1);
    expect(count(xml, "<attributes>")).toBe(1);
    expect(measureXml(xml, 1)).toContain("<sign>G</sign>");
    expect(measureXml(xml, 1)).toContain("<sign>F</sign>");
  });

  it("carries the key signature", () => {
    expect(xmlFor({ key: keyOf("D", 0, "major") })).toContain("<fifths>2</fifths>");
    expect(xmlFor({ key: keyOf("E", -1, "major") })).toContain("<fifths>-3</fifths>");
    // A minor key takes the signature of its relative major.
    expect(xmlFor({ key: keyOf("C", 1, "harmonicMinor") })).toContain("<fifths>4</fifths>");
  });

  it("opens every tag it closes", () => {
    const xml = xmlFor({ octaves: 2, key: keyOf("F", 1, "major") });
    for (const tag of ["note", "pitch", "measure", "part", "notations"]) {
      expect(count(xml, `<${tag}>`) + count(xml, `<${tag} `), tag).toBe(
        count(xml, `</${tag}>`),
      );
    }
  });

  it("rewinds between the hands so both are written over the same beats", () => {
    const xml = xmlFor();
    // One backup per measure, and the full bar long.
    expect(count(xml, "<backup><duration>4</duration></backup>")).toBe(
      count(xml, "<measure number="),
    );
  });

  it("pads a short final measure with rests", () => {
    // Fifteen notes per hand fall as 4 + 4 + 4 + 3, so one beat is left over.
    const xml = xmlFor();
    expect(count(xml, "<measure number=")).toBe(4);
    expect(count(measureXml(xml, 4), "<rest/>")).toBe(2); // one per hand
  });
});

describe("notes", () => {
  it("writes step, alteration and octave", () => {
    const xml = xmlFor({ key: keyOf("D", 0, "major") });
    expect(xml).toContain("<step>F</step>");
    expect(xml).toContain("<alter>1</alter>");
    expect(xml).toContain("<octave>4</octave>");
  });

  it("omits the alteration when there is none", () => {
    const first = xmlFor().split("<note>")[1];
    expect(first).toContain("<step>C</step>");
    expect(first).not.toContain("<alter>");
  });

  it("puts each hand on its own staff and voice", () => {
    const xml = xmlFor();
    expect(count(xml, "<staff>1</staff>")).toBe(count(xml, "<staff>2</staff>"));
    expect(count(xml, "<voice>1</voice>")).toBe(count(xml, "<voice>2</voice>"));
  });

  it("attaches fingerings when asked, and none when not", () => {
    expect(xmlFor()).toContain("<fingering>1</fingering>");
    expect(xmlFor({ fingerings: false })).not.toContain("<fingering>");
    // Minor carries none regardless, since those are not settled.
    expect(xmlFor({ key: keyOf("A", 0, "harmonicMinor") })).not.toContain("<fingering>");
  });
});

describe("accidentals are printed the way an engraver prints them", () => {
  it("leaves alone what the key signature already says", () => {
    // Every F in D major is sharp by signature and needs no sign.
    expect(xmlFor({ key: keyOf("D", 0, "major") })).not.toContain("<accidental>");
  });

  it("marks a note the signature does not cover", () => {
    // The raised seventh of A harmonic minor.
    const xml = xmlFor({ key: keyOf("A", 0, "harmonicMinor") });
    expect(xml).toContain("<accidental>sharp</accidental>");
  });

  it("marks it once per bar, not once per note", () => {
    /*
     * Two octaves of A harmonic minor put G sharp 6 twice in the fourth bar,
     * on the way up and straight back down. A sign holds for the rest of the
     * bar, so printing it again would read as a mistake.
     */
    const xml = xmlFor({ key: keyOf("A", 0, "harmonicMinor"), octaves: 2 });
    const bar = rightHandOf(measureXml(xml, 4));

    expect(count(bar, "<step>G</step>")).toBe(2);
    expect(count(bar, "<accidental>sharp</accidental>")).toBe(1);
  });

  it("marks it again in the next bar, because a bar line cancels", () => {
    const xml = xmlFor({ key: keyOf("A", 0, "harmonicMinor"), octaves: 2 });
    expect(count(rightHandOf(measureXml(xml, 2)), "<accidental>sharp</accidental>")).toBe(1);
    expect(count(rightHandOf(measureXml(xml, 6)), "<accidental>sharp</accidental>")).toBe(1);
  });

  it("names a double sharp correctly", () => {
    // G sharp minor raises its F sharp to F double sharp.
    const xml = xmlFor({ key: keyOf("G", 1, "harmonicMinor") });
    expect(xml).toContain("<alter>2</alter>");
    expect(xml).toContain("<accidental>double-sharp</accidental>");
  });
});

describe("the title", () => {
  it("travels with the document and is escaped", () => {
    const xml = xmlFor({ key: keyOf("E", -1, "major"), octaves: 2 });
    expect(xml).toContain("<movement-title>Tonleiter Es-Dur · 2 Oktaven</movement-title>");
  });
});
