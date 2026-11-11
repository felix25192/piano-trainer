import { describe, expect, it } from "vitest";
import { beatGrid, countIn, countOf } from "./pulse";
import type { Meter, Score, ScoreStep } from "./score";

/** Steps at the given onsets (whole notes), each with its bar number. */
function scoreOf(meter: Meter | undefined, ...steps: Array<[number, number]>): Score {
  return {
    title: "test",
    steps: steps.map(
      ([measure, onset], index): ScoreStep => ({
        index,
        measure,
        onset,
        notes: [{ midi: 60, staff: 1, duration: 0.25, heldOver: false }],
        bpm: 60,
        pedalUntil: null,
        meter,
      }),
    ),
  };
}

const fourFour: Meter = { beats: 4, beatType: 4 };
const threeFour: Meter = { beats: 3, beatType: 4 };

const numbers = (beats: { number: number }[]) => beats.map((b) => b.number).join(" ");

describe("how a bar is counted", () => {
  it("counts simple meters in their written unit", () => {
    expect(countOf(fourFour)).toEqual({ beats: 4, beat: 0.25 });
    expect(countOf(threeFour)).toEqual({ beats: 3, beat: 0.25 });
    expect(countOf({ beats: 2, beatType: 2 })).toEqual({ beats: 2, beat: 0.5 });
    expect(countOf({ beats: 5, beatType: 4 })).toEqual({ beats: 5, beat: 0.25 });
  });

  it("counts compound meters in dotted beats, as a pianist does", () => {
    expect(countOf({ beats: 6, beatType: 8 })).toEqual({ beats: 2, beat: 0.375 });
    expect(countOf({ beats: 9, beatType: 8 })).toEqual({ beats: 3, beat: 0.375 });
    expect(countOf({ beats: 12, beatType: 8 })).toEqual({ beats: 4, beat: 0.375 });
  });

  it("counts 3/8 in three, having no dotted beat to group into", () => {
    expect(countOf({ beats: 3, beatType: 8 })).toEqual({ beats: 3, beat: 0.125 });
  });

  it("falls back to four quarters without a time signature", () => {
    expect(countOf(undefined)).toEqual({ beats: 4, beat: 0.25 });
  });
});

describe("the beats of a piece", () => {
  it("puts a full bar's beats from its start", () => {
    const score = scoreOf(threeFour, [1, 0], [1, 0.5], [2, 0.75]);
    expect(beatGrid(score).map((b) => b.at)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25]);
    expect(numbers(beatGrid(score))).toBe("1 2 3 1 2 3");
  });

  it("counts an upbeat from the end of its bar", () => {
    // One quarter before the first full bar of a 3/4 piece: beat three.
    const score = scoreOf(threeFour, [1, 0], [2, 0.25], [2, 0.5]);
    const grid = beatGrid(score);
    expect(grid[0]).toEqual({ at: 0, number: 3 });
    expect(grid[1]).toEqual({ at: 0.25, number: 1 });
  });

  it("splits a bar played twice in a row into two", () => {
    // A one-bar repeat: bar 1 twice, then bar 2.
    const score = scoreOf(threeFour, [1, 0], [1, 0.75], [2, 1.5]);
    expect(numbers(beatGrid(score))).toBe("1 2 3 1 2 3 1 2 3");
  });

  it("counts 6/8 in two dotted quarters", () => {
    const score = scoreOf({ beats: 6, beatType: 8 }, [1, 0], [2, 0.75]);
    expect(beatGrid(score).map((b) => b.at)).toEqual([0, 0.375, 0.75, 1.125]);
  });
});

describe("the count-in", () => {
  it("is one bar before an entry on the downbeat", () => {
    const score = scoreOf(fourFour, [1, 0], [2, 1]);
    const beats = countIn(score, 0);
    expect(beats.map((b) => b.at)).toEqual([-1, -0.75, -0.5, -0.25]);
    expect(numbers(beats)).toBe("1 2 3 4");
  });

  it("is three beats in 3/4", () => {
    expect(numbers(countIn(scoreOf(threeFour, [1, 0], [2, 0.75]), 0))).toBe("1 2 3");
  });

  it("adds the beats before an entry in the middle of a bar", () => {
    // Entering on beat three of 4/4: a whole bar, then one and two.
    const score = scoreOf(fourFour, [1, 0], [1, 0.5], [2, 1]);
    expect(numbers(countIn(score, 1))).toBe("1 2 3 4 1 2");
  });

  it("counts a full bar and the first beats before an upbeat", () => {
    // An upbeat on three in 3/4: "1 2 3 | 1 2", then the upbeat.
    const score = scoreOf(threeFour, [1, 0], [2, 0.25]);
    const beats = countIn(score, 0);
    expect(numbers(beats)).toBe("1 2 3 1 2");
    expect(beats[beats.length - 1].at).toBeCloseTo(-0.25);
  });

  it("stays on the beat when the entry falls between two", () => {
    // An entry an eighth after beat one: the count ends on beat one.
    const score = scoreOf(fourFour, [1, 0], [1, 0.125], [2, 1]);
    const beats = countIn(score, 1);
    expect(numbers(beats)).toBe("1 2 3 4 1");
    expect(beats[beats.length - 1].at).toBe(0);
  });

  it("counts in two before a piece in 6/8", () => {
    expect(numbers(countIn(scoreOf({ beats: 6, beatType: 8 }, [1, 0], [2, 0.75]), 0))).toBe("1 2");
  });
});
