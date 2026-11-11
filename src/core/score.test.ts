import { describe, expect, it } from "vitest";
import { playableMeasures, type Score, type ScoreStep } from "./score";

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
