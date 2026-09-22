import { describe, expect, it } from "vitest";
import { buildSchedule, FALLBACK_BPM, stepAtTime } from "./playback";
import type { ExpectedNote, Score, ScoreStep } from "./score";

/** A struck note of the given length in whole notes. */
function note(midi: number, duration: number): ExpectedNote {
  return { midi, staff: 1, duration, heldOver: false };
}

/** A note that only continues a tie: already sounding, not struck again. */
function held(midi: number, duration: number): ExpectedNote {
  return { midi, staff: 1, duration, heldOver: true };
}

function scoreOf(
  ...steps: Array<{ onset: number; bpm: number; notes: ExpectedNote[] }>
): Score {
  return {
    title: "test",
    steps: steps.map(
      (s, index): ScoreStep => ({ index, measure: 1, ...s }),
    ),
  };
}

describe("turning note values into seconds", () => {
  it("gives a quarter note one second at 60", () => {
    const score = scoreOf(
      { onset: 0, bpm: 60, notes: [note(60, 0.25)] },
      { onset: 0.25, bpm: 60, notes: [note(62, 0.25)] },
    );

    const { notes } = buildSchedule(score, 0);

    expect(notes[0].start).toBeCloseTo(0);
    expect(notes[0].duration).toBeCloseTo(1);
    expect(notes[1].start).toBeCloseTo(1);
  });

  it("gives a dotted half in 3/4 the whole bar", () => {
    // Three quarters is 0.75 of a whole note, and at 60 that is three seconds.
    const score = scoreOf(
      { onset: 0, bpm: 60, notes: [note(67, 0.75)] },
      { onset: 0.75, bpm: 60, notes: [note(69, 0.25)] },
    );

    expect(buildSchedule(score, 0).notes[0].duration).toBeCloseTo(3);
  });

  it("gives a dotted quarter its beat and a half", () => {
    const score = scoreOf(
      { onset: 0, bpm: 60, notes: [note(67, 0.375)] },
      { onset: 0.375, bpm: 60, notes: [note(69, 0.125)] },
    );

    expect(buildSchedule(score, 0).notes[0].duration).toBeCloseTo(1.5);
  });

  /*
   * The opening of the Moonlight Sonata: triplet eighths, which OSMD reports
   * as a twelfth of a whole note each. Three of them have to add up to exactly
   * one quarter, or the left hand and the right hand drift apart within a bar.
   */
  it("keeps three triplet eighths equal to one quarter", () => {
    const third = 1 / 12;
    const score = scoreOf(
      { onset: 0, bpm: 44, notes: [note(56, third)] },
      { onset: third, bpm: 44, notes: [note(61, third)] },
      { onset: third * 2, bpm: 44, notes: [note(64, third)] },
      { onset: 0.25, bpm: 44, notes: [note(56, third)] },
    );

    const { notes } = buildSchedule(score, 0);
    const quarter = (60 / 44) * 1;

    expect(notes[3].start).toBeCloseTo(quarter, 6);
    expect(notes[1].start - notes[0].start).toBeCloseTo(quarter / 3, 6);
  });
});

describe("ties", () => {
  /*
   * Bar 1 of the C major prelude holds an E through most of the bar, written
   * as two notes joined by a tie. It is struck once and rings for the length
   * of the pair, which is what `Tie.Duration` reports on the first of them.
   */
  it("sounds a tied note once, for the whole chain", () => {
    const score = scoreOf(
      { onset: 0, bpm: 60, notes: [note(64, 0.4375)] },
      { onset: 0.25, bpm: 60, notes: [held(64, 0.25), note(76, 0.0625)] },
    );

    const { notes } = buildSchedule(score, 0);

    expect(notes).toHaveLength(2);
    expect(notes[0].midi).toBe(64);
    expect(notes[0].duration).toBeCloseTo(0.4375 * 4);
    // The struck note that shares the second step is still there.
    expect(notes[1].midi).toBe(76);
  });
});

describe("tempo changes", () => {
  /*
   * The C major prelude runs at 72 and drops to 30 for its last two bars. Both
   * stretches have to keep their own speed: a single tempo for the piece would
   * misplace every note after the change.
   */
  const score = scoreOf(
    { onset: 0, bpm: 72, notes: [note(60, 0.25)] },
    { onset: 0.25, bpm: 72, notes: [note(62, 0.25)] },
    { onset: 0.5, bpm: 30, notes: [note(64, 0.25)] },
    { onset: 0.75, bpm: 30, notes: [note(65, 0.25)] },
  );

  it("spaces each stretch at its own tempo", () => {
    const { notes } = buildSchedule(score, 0);

    expect(notes[1].start - notes[0].start).toBeCloseTo(60 / 72);
    expect(notes[3].start - notes[2].start).toBeCloseTo(60 / 30);
  });

  it("lengthens a note that reaches into the slower bars", () => {
    // A half note starting one quarter before the change: the first quarter
    // still belongs to 72, the second already to 30.
    const across = scoreOf(
      { onset: 0.25, bpm: 72, notes: [note(60, 0.5)] },
      { onset: 0.5, bpm: 30, notes: [note(64, 0.25)] },
      { onset: 0.75, bpm: 30, notes: [note(65, 0.25)] },
    );

    expect(buildSchedule(across, 0).notes[0].duration).toBeCloseTo(60 / 72 + 60 / 30);
  });
});

describe("where it starts and how fast", () => {
  const score = scoreOf(
    { onset: 0, bpm: 60, notes: [note(60, 0.25)] },
    { onset: 0.25, bpm: 60, notes: [note(62, 0.25)] },
    { onset: 0.5, bpm: 60, notes: [note(64, 0.25)] },
  );

  it("puts the step it starts from at zero", () => {
    const { notes, steps } = buildSchedule(score, 1);

    expect(notes).toHaveLength(2);
    expect(notes[0].midi).toBe(62);
    expect(notes[0].start).toBeCloseTo(0);
    expect(steps[0].index).toBe(1);
  });

  it("stretches everything by the tempo factor", () => {
    const half = buildSchedule(score, 0, 0.5);

    expect(half.notes[1].start).toBeCloseTo(2);
    expect(half.notes[0].duration).toBeCloseTo(2);
  });

  it("returns nothing when there is nothing left to play", () => {
    expect(buildSchedule(score, 99).notes).toHaveLength(0);
    expect(buildSchedule(score, 99).duration).toBe(0);
  });

  it("reaches to the end of the last note", () => {
    expect(buildSchedule(score, 0).duration).toBeCloseTo(3);
  });
});

describe("scores that name no tempo", () => {
  // A file without a tempo mark still reaches us with OSMD's default of 120,
  // so this is the guard for the case where not even that survived.
  it("falls back rather than dividing by zero", () => {
    const score = scoreOf(
      { onset: 0, bpm: 0, notes: [note(60, 0.25)] },
      { onset: 0.25, bpm: 0, notes: [note(62, 0.25)] },
    );

    expect(buildSchedule(score, 0).notes[1].start).toBeCloseTo(60 / FALLBACK_BPM);
  });
});

describe("following the music with the cursor", () => {
  const score = scoreOf(
    { onset: 0, bpm: 60, notes: [note(60, 0.25)] },
    // A rest: nothing to play, but it still takes its beat.
    { onset: 0.25, bpm: 60, notes: [] },
    { onset: 0.5, bpm: 60, notes: [note(64, 0.25)] },
  );
  const schedule = buildSchedule(score, 0);

  it("names the step that has started, not the one coming", () => {
    expect(stepAtTime(schedule, 0)).toBe(0);
    expect(stepAtTime(schedule, 0.99)).toBe(0);
    expect(stepAtTime(schedule, 1.01)).toBe(1);
    expect(stepAtTime(schedule, 2.5)).toBe(2);
  });

  it("counts a rest as time passing", () => {
    expect(schedule.steps[2].at).toBeCloseTo(2);
  });

  it("has nothing to say about an empty schedule", () => {
    expect(stepAtTime({ notes: [], steps: [], duration: 0 }, 1)).toBeNull();
  });
});
