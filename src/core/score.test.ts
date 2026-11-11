import { describe, expect, it } from "vitest";
import { loopSteps, playableMeasures, type Score, type ScoreStep } from "./score";

function note(midi: number, staff = 1, heldOver = false): ScoreStep["notes"][number] {
  return { midi, staff, duration: 0.25, heldOver };
}

function step(index: number, measure: number, notes: ScoreStep["notes"]): ScoreStep {
  return { index, measure, notes, onset: index * 0.25, bpm: 60, pedalUntil: null };
}

function scoreOf(...steps: ScoreStep[]): Score {
  return { title: "test", steps };
}

describe("playableMeasures", () => {
  it("leaves out a bar of rests", () => {
    const score = scoreOf(step(0, 1, []), step(1, 2, [note(60)]), step(2, 3, [note(62)]));
    expect(playableMeasures(score, "both")).toEqual([2, 3]);
  });

  it("leaves out the other hand's bars when one hand is practised", () => {
    const score = scoreOf(
      step(0, 1, [note(48, 2)]), // left hand alone
      step(1, 2, [note(60, 1), note(48, 2)]),
      step(2, 3, [note(64, 1)]), // right hand alone
    );
    expect(playableMeasures(score, "right")).toEqual([2, 3]);
    expect(playableMeasures(score, "left")).toEqual([1, 2]);
    expect(playableMeasures(score, "both")).toEqual([1, 2, 3]);
  });

  it("counts a bar that only holds a tie over, since jumping there strikes it", () => {
    const score = scoreOf(step(0, 1, [note(60)]), step(1, 2, [note(60, 1, true)]));
    expect(playableMeasures(score, "both")).toEqual([1, 2]);
  });

  it("lists each bar once, in order", () => {
    const score = scoreOf(step(0, 2, [note(60)]), step(1, 2, [note(62)]), step(2, 1, [note(64)]));
    expect(playableMeasures(score, "both")).toEqual([1, 2]);
  });
});

describe("loopSteps", () => {
  /** One step per bar, in the order the bars are played. */
  const route = (...measures: number[]) =>
    scoreOf(...measures.map((m, i) => step(i, m, [note(60 + i)])));

  it("runs from the first step of the first bar to the last of the last", () => {
    const score = scoreOf(
      step(0, 1, [note(60)]),
      step(1, 2, [note(62)]), step(2, 2, [note(64)]),
      step(3, 3, [note(65)]), step(4, 3, [note(67)]),
      step(5, 4, [note(69)]),
    );
    expect(loopSteps(score, 2, 3)).toEqual({ start: 1, end: 4 });
  });

  it("takes the bars in either order", () => {
    expect(loopSteps(route(1, 2, 3, 4), 3, 2)).toEqual({ start: 1, end: 2 });
  });

  it("takes the pass that goes on to the last bar when a repeat sends the first one back", () => {
    // Bars 1–4 repeated, then 5 and 6: bars 3 to 6 are the second pass.
    const score = route(1, 2, 3, 4, 1, 2, 3, 4, 5, 6);
    expect(loopSteps(score, 3, 6)).toEqual({ start: 6, end: 9 });
  });

  it("takes one pass when the first bar itself is repeated, so it never comes twice in a row", () => {
    expect(loopSteps(route(1, 2, 1, 2, 3), 1, 2)).toEqual({ start: 0, end: 1 });
  });

  it("keeps a repeat that lies inside the span", () => {
    // Bars 2 and 3 are played twice on the way from 1 to 4.
    expect(loopSteps(route(1, 2, 3, 2, 3, 4), 1, 4)).toEqual({ start: 0, end: 5 });
  });

  it("stops before the first ending when the span ends there", () => {
    // 1 2(first ending) | 1 3(second ending): bars 1 to 2 are the first pass.
    expect(loopSteps(route(1, 2, 1, 3), 1, 2)).toEqual({ start: 0, end: 1 });
  });

  it("takes the second ending when the span goes on into it", () => {
    // 1 2 3 4(first ending) | 1 2 3 5(second ending) 6
    const score = route(1, 2, 3, 4, 1, 2, 3, 5, 6);
    expect(loopSteps(score, 3, 5)).toEqual({ start: 6, end: 7 });
  });

  it("finds nothing in a span past the end", () => {
    expect(loopSteps(route(1, 2), 5, 7)).toBeNull();
  });
});
