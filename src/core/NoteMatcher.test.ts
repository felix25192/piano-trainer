import { beforeEach, describe, expect, it } from "vitest";
import { NoteMatcher } from "./NoteMatcher";
import type { Score, ScoreStep } from "./score";
import type { PlayedNote } from "./NoteInputSource";

/** Builds a step from MIDI numbers; an empty list is a rest. */
function step(index: number, measure: number, ...midi: number[]): ScoreStep {
  return { index, measure, notes: midi.map((m) => ({ midi: m, staff: 1 })) };
}

function scoreOf(...steps: ScoreStep[]): Score {
  return { title: "test", steps };
}

/** A note as a MIDI keyboard would report it: certain, and on time. */
function played(midi: number, confidence = 1): PlayedNote {
  return { midi, time: 0, confidence };
}

describe("single notes", () => {
  let matcher: NoteMatcher;

  beforeEach(() => {
    // C4 D4 E4
    matcher = new NoteMatcher(scoreOf(step(0, 1, 60), step(1, 1, 62), step(2, 1, 64)));
  });

  it("advances on the expected note", () => {
    const outcome = matcher.noteOn(played(60));
    expect(outcome.kind).toBe("advanced");
    expect(matcher.currentStep?.index).toBe(1);
  });

  it("stands still on a wrong note", () => {
    const outcome = matcher.noteOn(played(61));
    expect(outcome).toEqual({ kind: "wrong", played: 61, expected: [60] });
    expect(matcher.currentStep?.index).toBe(0);
    expect(matcher.hasError).toBe(true);
  });

  it("clears the error once the player recovers", () => {
    matcher.noteOn(played(61));
    expect(matcher.hasError).toBe(true);

    matcher.noteOn(played(60));
    expect(matcher.hasError).toBe(false);
    expect(matcher.currentStep?.index).toBe(1);
  });

  it("does not skip ahead when the next note is played early", () => {
    // 62 belongs to the following step, so here it is simply wrong.
    expect(matcher.noteOn(played(62)).kind).toBe("wrong");
    expect(matcher.currentStep?.index).toBe(0);
  });

  it("reports the piece as finished after the last note", () => {
    matcher.noteOn(played(60));
    matcher.noteOn(played(62));
    const last = matcher.noteOn(played(64));

    expect(last).toMatchObject({ kind: "advanced", to: null });
    expect(matcher.finished).toBe(true);
    expect(matcher.currentStep).toBeNull();
  });

  it("ignores anything played after the end", () => {
    matcher.noteOn(played(60));
    matcher.noteOn(played(62));
    matcher.noteOn(played(64));

    expect(matcher.noteOn(played(60))).toEqual({ kind: "ignored", reason: "finished" });
  });
});

describe("chords", () => {
  let matcher: NoteMatcher;

  beforeEach(() => {
    // C major triad, then a single D4.
    matcher = new NoteMatcher(scoreOf(step(0, 1, 60, 64, 67), step(1, 1, 62)));
  });

  it("waits until every note of the chord has sounded", () => {
    expect(matcher.noteOn(played(60))).toEqual({ kind: "progress", remaining: [64, 67] });
    expect(matcher.noteOn(played(67))).toEqual({ kind: "progress", remaining: [64] });
    expect(matcher.currentStep?.index).toBe(0);

    expect(matcher.noteOn(played(64)).kind).toBe("advanced");
    expect(matcher.currentStep?.index).toBe(1);
  });

  it("accepts the notes of a chord in any order", () => {
    matcher.noteOn(played(67));
    matcher.noteOn(played(64));
    expect(matcher.noteOn(played(60)).kind).toBe("advanced");
  });

  it("keeps the notes already played when a wrong one comes in between", () => {
    matcher.noteOn(played(60));
    expect(matcher.noteOn(played(66)).kind).toBe("wrong");

    // C4 still counts - the player should not have to start the chord again.
    expect(matcher.remaining).toEqual([64, 67]);
  });

  it("ignores a note that was already part of this chord", () => {
    matcher.noteOn(played(60));
    expect(matcher.noteOn(played(60))).toEqual({ kind: "ignored", reason: "duplicate" });
    expect(matcher.remaining).toEqual([64, 67]);
  });

  it("treats a doubled pitch in the notation as one required key", () => {
    // The same MIDI number written in both staves is still one key on the piano.
    const doubled = new NoteMatcher(scoreOf(step(0, 1, 60, 60, 64)));
    expect(doubled.remaining).toEqual([60, 64]);
    doubled.noteOn(played(60));
    expect(doubled.noteOn(played(64)).kind).toBe("advanced");
  });
});

describe("rests", () => {
  it("never comes to rest on a silent step", () => {
    const matcher = new NoteMatcher(
      scoreOf(step(0, 1, 60), step(1, 1), step(2, 2, 62)),
    );

    matcher.noteOn(played(60));
    expect(matcher.currentStep?.index).toBe(2);
  });

  it("skips a rest that opens the piece", () => {
    const matcher = new NoteMatcher(scoreOf(step(0, 1), step(1, 1, 60)));
    expect(matcher.currentStep?.index).toBe(1);
  });

  it("finishes a piece that ends on a rest", () => {
    const matcher = new NoteMatcher(scoreOf(step(0, 1, 60), step(1, 2)));
    matcher.noteOn(played(60));
    expect(matcher.finished).toBe(true);
  });

  it("is finished immediately when nothing is playable", () => {
    expect(new NoteMatcher(scoreOf(step(0, 1), step(1, 1))).finished).toBe(true);
  });
});

describe("confidence floor", () => {
  it("discards notes the source is unsure about", () => {
    const matcher = new NoteMatcher(scoreOf(step(0, 1, 60)), { minConfidence: 0.7 });

    expect(matcher.noteOn(played(60, 0.5))).toEqual({
      kind: "ignored",
      reason: "low-confidence",
    });
    expect(matcher.currentStep?.index).toBe(0);

    expect(matcher.noteOn(played(60, 0.9)).kind).toBe("advanced");
  });

  it("does not let an uncertain wrong note raise an error", () => {
    const matcher = new NoteMatcher(scoreOf(step(0, 1, 60)), { minConfidence: 0.7 });
    matcher.noteOn(played(61, 0.2));
    expect(matcher.hasError).toBe(false);
  });
});

describe("navigation", () => {
  const score = scoreOf(
    step(0, 1, 60),
    step(1, 2, 62),
    step(2, 2, 64),
    step(3, 3, 65),
  );

  it("returns to the start on reset, clearing any error", () => {
    const matcher = new NoteMatcher(score);
    matcher.noteOn(played(60));
    matcher.noteOn(played(99));
    expect(matcher.hasError).toBe(true);

    matcher.reset();
    expect(matcher.currentStep?.index).toBe(0);
    expect(matcher.hasError).toBe(false);
  });

  it("jumps to the first playable step of a measure", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToMeasure(2);
    expect(matcher.currentStep?.index).toBe(1);
    expect(matcher.noteOn(played(62)).kind).toBe("advanced");
  });

  it("lands at the end when the measure is past the piece", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToMeasure(99);
    expect(matcher.finished).toBe(true);
  });
});

describe("the opening of the Moonlight Sonata", () => {
  // Bar 1: the left hand holds the C#2/C#3 octave while the right hand plays
  // the triplet G#3 - C#4 - E4. Verified against the rendered score.
  const score = scoreOf(
    {
      index: 0,
      measure: 1,
      notes: [
        { midi: 37, staff: 2 },
        { midi: 49, staff: 2 },
        { midi: 56, staff: 1 },
      ],
    },
    { index: 1, measure: 1, notes: [{ midi: 61, staff: 1 }] },
    { index: 2, measure: 1, notes: [{ midi: 64, staff: 1 }] },
  );

  it("requires both hands before it moves on", () => {
    const matcher = new NoteMatcher(score);
    expect(matcher.remaining).toEqual([37, 49, 56]);

    matcher.noteOn(played(56));
    matcher.noteOn(played(37));
    expect(matcher.currentStep?.index).toBe(0);

    expect(matcher.noteOn(played(49)).kind).toBe("advanced");
  });

  it("blocks on C natural where the score asks for C sharp", () => {
    const matcher = new NoteMatcher(score);
    matcher.noteOn(played(56));
    matcher.noteOn(played(37));
    matcher.noteOn(played(49));

    // 60 is C4; the piece is in C sharp minor and wants 61.
    expect(matcher.noteOn(played(60)).kind).toBe("wrong");
    expect(matcher.noteOn(played(61)).kind).toBe("advanced");
  });
});
