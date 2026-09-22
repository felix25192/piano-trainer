import { describe, expect, it } from "vitest";
import { pedalEndAt, pedalSpans, type PedalMark } from "./pedal";

function down(at: number): PedalMark {
  return { at, down: true };
}

function up(at: number): PedalMark {
  return { at, down: false };
}

describe("reading pedal marks as spans", () => {
  it("pairs a plain down and up", () => {
    expect(pedalSpans([down(0), up(0.5)])).toEqual([{ from: 0, to: 0.5 }]);
  });

  /*
   * The case that broke a first attempt. Bar 2 of the Chopin nocturne has the
   * foot come up and go straight back down on the same beat, so both marks
   * carry the timestamp 1.25. Read down-first, they pair into a span of no
   * length and leave the surrounding marks dangling.
   */
  it("reads a pedal change as up first, then down", () => {
    const spans = pedalSpans([down(1), down(1.25), up(1.25), up(1.5)]);

    expect(spans).toEqual([
      { from: 1, to: 1.25 },
      { from: 1.25, to: 1.5 },
    ]);
  });

  it("keeps its nerve when the marks do not pair", () => {
    // A second down while one is open, and an up with nothing open.
    expect(pedalSpans([down(0), down(0.25), up(1), up(2)])).toEqual([
      { from: 0, to: 1 },
    ]);
  });

  it("holds a pedal that is never lifted to the end", () => {
    expect(pedalSpans([down(3)])).toEqual([
      { from: 3, to: Number.POSITIVE_INFINITY },
    ]);
  });

  it("does not care what order it is handed", () => {
    const shuffled = [up(1.5), down(1), up(1.25), down(1.25)];
    expect(pedalSpans(shuffled)).toEqual([
      { from: 1, to: 1.25 },
      { from: 1.25, to: 1.5 },
    ]);
  });
});

describe("asking whether the pedal is down", () => {
  const spans = pedalSpans([down(1), up(1.25), down(1.25), up(1.5), down(3), up(4)]);

  it("reports when it comes up again", () => {
    expect(pedalEndAt(spans, 1)).toBe(1.25);
    expect(pedalEndAt(spans, 1.1)).toBe(1.25);
  });

  it("says nothing before the first mark or in a gap", () => {
    expect(pedalEndAt(spans, 0.5)).toBeNull();
    expect(pedalEndAt(spans, 2)).toBeNull();
  });

  /*
   * A note struck exactly on a pedal change is caught by the new pedal, not
   * damped by the old one — which is what the foot does.
   */
  it("hands a note on a change to the new pedal", () => {
    expect(pedalEndAt(spans, 1.25)).toBe(1.5);
  });

  it("treats the lift itself as already damped", () => {
    expect(pedalEndAt(spans, 1.5)).toBeNull();
    expect(pedalEndAt(spans, 4)).toBeNull();
  });

  it("has nothing to say when the piece has no pedal at all", () => {
    expect(pedalEndAt([], 1)).toBeNull();
  });
});
