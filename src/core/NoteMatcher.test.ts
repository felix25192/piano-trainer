import { beforeEach, describe, expect, it } from "vitest";
import { NoteMatcher } from "./NoteMatcher";
import type { Score, ScoreStep } from "./score";
import type { PlayedNote } from "./NoteInputSource";

/**
 * Builds a step from MIDI numbers; an empty list is a rest.
 *
 * The timing is plain quarter notes at 60. The matcher ignores it entirely —
 * it only ever asks what has to be played next, never when — but the score
 * model carries it for playback, so the steps have to be complete.
 */
function step(index: number, measure: number, ...midi: number[]): ScoreStep {
  return {
    index,
    measure,
    notes: midi.map((m) => ({ midi: m, staff: 1, duration: 0.25, heldOver: false })),
    onset: index * 0.25,
    bpm: 60,
    pedalUntil: null,
  };
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

  it("jumps to a step by index", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToStep(2);
    expect(matcher.currentStep?.index).toBe(2);
    expect(matcher.noteOn(played(64)).kind).toBe("advanced");
  });

  it("clamps a tap that lands before the first note", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToStep(-5);
    expect(matcher.currentStep?.index).toBe(0);
  });

  it("clamps a tap past the last note instead of refusing it", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToStep(999);
    expect(matcher.finished).toBe(true);
  });

  it("rounds a fractional index, since it comes from a pixel measurement", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToStep(1.6);
    expect(matcher.currentStep?.index).toBe(2);
  });

  it("moves on when the tapped step is a rest", () => {
    const withRest = scoreOf(step(0, 1, 60), step(1, 1), step(2, 2, 62));
    const matcher = new NoteMatcher(withRest);
    matcher.seekToStep(1);
    expect(matcher.currentStep?.index).toBe(2);
  });

  it("clears a pending error when jumping", () => {
    const matcher = new NoteMatcher(score);
    matcher.noteOn(played(99));
    expect(matcher.hasError).toBe(true);

    matcher.seekToStep(2);
    expect(matcher.hasError).toBe(false);
  });
});

describe("the opening of the Moonlight Sonata", () => {
  // Bar 1: the left hand holds the C#2/C#3 octave while the right hand plays
  // the triplet G#3 - C#4 - E4. Verified against the rendered score.
  const score = scoreOf(
    {
      index: 0,
      measure: 1,
      onset: 0,
      bpm: 44,
      pedalUntil: null,
      notes: [
        // The octave is a whole note; the triplet eighths above it are a
        // twelfth of one each.
        { midi: 37, staff: 2, duration: 1, heldOver: false },
        { midi: 49, staff: 2, duration: 1, heldOver: false },
        { midi: 56, staff: 1, duration: 1 / 12, heldOver: false },
      ],
    },
    {
      index: 1,
      measure: 1,
      onset: 1 / 12,
      bpm: 44,
      pedalUntil: null,
      notes: [{ midi: 61, staff: 1, duration: 1 / 12, heldOver: false }],
    },
    {
      index: 2,
      measure: 1,
      onset: 2 / 12,
      bpm: 44,
      pedalUntil: null,
      notes: [{ midi: 64, staff: 1, duration: 1 / 12, heldOver: false }],
    },
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

/** A step with notes spelled out, for the cases where staff and ties matter. */
function stepWith(index: number, measure: number, notes: ScoreStep["notes"]): ScoreStep {
  return { index, measure, notes, onset: index * 0.25, bpm: 60, pedalUntil: null };
}

function note(midi: number, staff = 1, heldOver = false): ScoreStep["notes"][number] {
  return { midi, staff, duration: 0.25, heldOver };
}

/*
 * A tie is one sound, held. Striking it again is a different thing on a piano
 * — audibly — and through the microphone it could not even be asked for: a
 * held key makes no new strike to hear.
 */
describe("tied notes", () => {
  // Bar 1: C4 tied over into the next step, then D4. Bar 2 opens with a tie
  // held across the bar line from the E4 before it.
  const score = scoreOf(
    stepWith(0, 1, [note(60)]),
    stepWith(1, 1, [note(60, 1, true)]),
    stepWith(2, 1, [note(62)]),
    stepWith(3, 1, [note(64)]),
    stepWith(4, 2, [note(64, 1, true)]),
    stepWith(5, 2, [note(65)]),
  );

  it("does not ask again for a note held over from a tie", () => {
    const matcher = new NoteMatcher(score);
    expect(matcher.noteOn(played(60))).toMatchObject({ kind: "advanced" });
    expect(matcher.currentStep?.index).toBe(2);
    expect(matcher.remaining).toEqual([62]);
  });

  it("counts the tied note struck again as a misreading", () => {
    const matcher = new NoteMatcher(score);
    matcher.noteOn(played(60));
    expect(matcher.noteOn(played(60)).kind).toBe("wrong");
    expect(matcher.hasError).toBe(true);
  });

  it("asks only for what is new where a tie is held under it", () => {
    const matcher = new NoteMatcher(
      scoreOf(
        stepWith(0, 1, [note(60), note(64)]),
        stepWith(1, 1, [note(60, 1, true), note(67)]),
      ),
    );
    matcher.noteOn(played(60));
    matcher.noteOn(played(64));
    expect(matcher.remaining).toEqual([67]);
  });

  /*
   * Starting in the middle of a tie — by tapping it, or with a bar that opens
   * on one — nothing is sounding yet. Whoever starts there strikes the note.
   */
  it("asks for the held note when practice starts in the middle of the tie", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToStep(1);
    expect(matcher.remaining).toEqual([60]);
    expect(matcher.noteOn(played(60)).kind).toBe("advanced");
    expect(matcher.currentStep?.index).toBe(2);
  });

  it("asks for it too when a bar opens on a tie", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToMeasure(2);
    expect(matcher.currentStep?.index).toBe(4);
    expect(matcher.remaining).toEqual([64]);
  });

  it("goes back to passing it over once playing has moved on", () => {
    const matcher = new NoteMatcher(score);
    matcher.seekToStep(1);
    matcher.noteOn(played(60));
    matcher.noteOn(played(62));
    // E4 is struck at step 3 and held into bar 2; the next thing asked is F4.
    expect(matcher.noteOn(played(64))).toMatchObject({ kind: "advanced" });
    expect(matcher.currentStep?.index).toBe(5);
  });
});

/*
 * Hands separately, the way a piece is learnt — and the only way the
 * microphone can follow at all, since both hands together are a chord.
 */
describe("one hand at a time", () => {
  // C4 over C3, then the left hand alone on D3, then E4 over E3.
  const score = scoreOf(
    stepWith(0, 1, [note(60, 1), note(48, 2)]),
    stepWith(1, 1, [note(50, 2)]),
    stepWith(2, 2, [note(64, 1), note(52, 2)]),
  );

  it("asks the right hand only for the upper staff", () => {
    const matcher = new NoteMatcher(score, { hands: "right" });
    expect(matcher.remaining).toEqual([60]);
    expect(matcher.noteOn(played(60)).kind).toBe("advanced");
    // Step 1 is the left hand's alone and is passed over like a rest.
    expect(matcher.currentStep?.index).toBe(2);
    expect(matcher.remaining).toEqual([64]);
  });

  it("asks the left hand for everything below it", () => {
    const matcher = new NoteMatcher(score, { hands: "left" });
    expect(matcher.remaining).toEqual([48]);
    matcher.noteOn(played(48));
    expect(matcher.remaining).toEqual([50]);
    matcher.noteOn(played(50));
    expect(matcher.remaining).toEqual([52]);
  });

  it("lets the other hand's written note pass without calling it wrong", () => {
    const matcher = new NoteMatcher(score, { hands: "right" });
    expect(matcher.noteOn(played(48))).toEqual({ kind: "ignored", reason: "other-hand" });
    expect(matcher.hasError).toBe(false);
    expect(matcher.currentStep?.index).toBe(0);
  });

  it("still calls a note written nowhere here wrong", () => {
    const matcher = new NoteMatcher(score, { hands: "right" });
    expect(matcher.noteOn(played(62)).kind).toBe("wrong");
  });

  it("keeps the place when the hands change, moving on only if it must", () => {
    const matcher = new NoteMatcher(score);
    matcher.noteOn(played(60));
    matcher.noteOn(played(48));
    expect(matcher.currentStep?.index).toBe(1);

    // Step 1 has nothing for the right hand, so the right hand starts at 2.
    matcher.setHands("right");
    expect(matcher.currentStep?.index).toBe(2);

    matcher.setHands("both");
    expect(matcher.currentStep?.index).toBe(2);
    expect(matcher.remaining).toEqual([52, 64]);
  });

  it("jumps to a bar where the chosen hand has something to do", () => {
    const rightRests = scoreOf(
      stepWith(0, 1, [note(48, 2)]),
      stepWith(1, 2, [note(50, 2)]),
      stepWith(2, 3, [note(64, 1), note(52, 2)]),
    );
    const matcher = new NoteMatcher(rightRests, { hands: "right" });
    expect(matcher.currentStep?.index).toBe(2);
    matcher.seekToMeasure(2);
    expect(matcher.currentStep?.index).toBe(2);
  });
});

/*
 * A loop repeats a span of bars. Whatever happens inside it is the ordinary
 * matching above; what is tested here is only where the position goes at the
 * edges.
 */
describe("loops", () => {
  // Four bars of two notes each: C D | E F | G A | B C.
  const fourBars = () =>
    scoreOf(
      step(0, 1, 60), step(1, 1, 62),
      step(2, 2, 64), step(3, 2, 65),
      step(4, 3, 67), step(5, 3, 69),
      step(6, 4, 71), step(7, 4, 72),
    );

  it("starts at the first bar of the span", () => {
    const matcher = new NoteMatcher(fourBars());
    expect(matcher.setLoop(2, 3)).toBe(true);
    expect(matcher.currentStep?.index).toBe(2);
    expect(matcher.progress.loop).toMatchObject({ from: 2, to: 3, start: 2, end: 5 });
  });

  it("goes back to the start after the last note of the span", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.setLoop(2, 3);
    for (const midi of [64, 65, 67]) matcher.noteOn(played(midi));
    expect(matcher.noteOn(played(69))).toMatchObject({ kind: "advanced", looped: true });
    expect(matcher.currentStep?.index).toBe(2);
    expect(matcher.finished).toBe(false);
  });

  it("never finishes while the loop reaches the last bar", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.setLoop(4, 4);
    matcher.noteOn(played(71));
    matcher.noteOn(played(72));
    expect(matcher.finished).toBe(false);
    expect(matcher.currentStep?.index).toBe(6);
  });

  it("goes back past rests at the end of the span", () => {
    const score = scoreOf(step(0, 1, 60), step(1, 1), step(2, 2, 64));
    const matcher = new NoteMatcher(score);
    matcher.setLoop(1, 1);
    expect(matcher.noteOn(played(60))).toMatchObject({ looped: true });
    expect(matcher.currentStep?.index).toBe(0);
  });

  it("asks again for a tied note at the start of the loop, since nothing sounds there yet", () => {
    const score = scoreOf(
      stepWith(0, 1, [note(60)]),
      stepWith(1, 2, [note(60, 1, true)]), // held over the bar line
      stepWith(2, 2, [note(62)]),
    );
    const matcher = new NoteMatcher(score);
    matcher.setLoop(2, 2);
    expect(matcher.remaining).toEqual([60]);
    matcher.noteOn(played(60));
    matcher.noteOn(played(62));
    expect(matcher.remaining).toEqual([60]);
  });

  it("restarts at the loop rather than the piece", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.setLoop(3, 4);
    matcher.noteOn(played(67));
    matcher.reset();
    expect(matcher.currentStep?.index).toBe(4);
  });

  it("lets a position put after the loop carry on", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.setLoop(1, 2);
    matcher.seekToMeasure(4);
    matcher.noteOn(played(71));
    matcher.noteOn(played(72));
    expect(matcher.finished).toBe(true);
  });

  it("runs into the loop from before it, and then keeps to it", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.setLoop(2, 2);
    matcher.seekToStep(0);
    for (const midi of [60, 62, 64]) matcher.noteOn(played(midi));
    expect(matcher.noteOn(played(65))).toMatchObject({ looped: true });
    expect(matcher.currentStep?.index).toBe(2);
  });

  it("runs on past the end once the loop is cleared, keeping the place", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.setLoop(1, 1);
    matcher.noteOn(played(60));
    matcher.clearLoop();
    expect(matcher.currentStep?.index).toBe(1);
    matcher.noteOn(played(62));
    expect(matcher.currentStep?.index).toBe(2);
    expect(matcher.progress.loop).toBeNull();
  });

  it("refuses a span with nothing in it and changes nothing", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.noteOn(played(60));
    expect(matcher.setLoop(7, 9)).toBe(false);
    expect(matcher.currentStep?.index).toBe(1);
    expect(matcher.progress.loop).toBeNull();
  });

  it("keeps the loop when the hands change", () => {
    const matcher = new NoteMatcher(fourBars());
    matcher.setLoop(2, 3);
    matcher.setHands("right");
    expect(matcher.progress.loop).toMatchObject({ from: 2, to: 3 });
  });

  it("plays a passage back to the loop's end from inside or before it, and to the piece's end after it", () => {
    const matcher = new NoteMatcher(fourBars());
    expect(matcher.passageEnd).toBeNull();

    matcher.setLoop(2, 3);
    expect(matcher.passageEnd).toBe(5);
    matcher.seekToStep(0);
    expect(matcher.passageEnd).toBe(5);
    matcher.seekToStep(6);
    expect(matcher.passageEnd).toBeNull();
  });
});
