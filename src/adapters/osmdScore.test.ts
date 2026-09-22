import { describe, expect, it } from "vitest";
import { stepAtFraction } from "./osmdScore";

/**
 * Only the pure part of the adapter is tested here — mapping a point on the
 * staff line back to a step. The rest of the file walks OSMD's object graph
 * and needs a browser, which is exactly why it is kept free of decisions.
 */

describe("stepAtFraction", () => {
  // Four notes spread evenly across the line.
  const anchors = [0, 0.25, 0.5, 0.75];

  it("finds the step a tap lands directly on", () => {
    expect(stepAtFraction(anchors, 0)).toBe(0);
    expect(stepAtFraction(anchors, 0.5)).toBe(2);
    expect(stepAtFraction(anchors, 0.75)).toBe(3);
  });

  it("picks the nearer of the two notes a tap falls between", () => {
    expect(stepAtFraction(anchors, 0.3)).toBe(1);
    expect(stepAtFraction(anchors, 0.45)).toBe(2);
  });

  it("resolves a tap exactly halfway to the earlier note", () => {
    // Either answer is defensible; pinning it makes the behaviour a decision.
    expect(stepAtFraction(anchors, 0.375)).toBe(1);
  });

  it("clamps a tap before the first and past the last note", () => {
    expect(stepAtFraction(anchors, -1)).toBe(0);
    expect(stepAtFraction(anchors, 5)).toBe(3);
  });

  it("returns the start for a score with no steps", () => {
    expect(stepAtFraction([], 0.5)).toBe(0);
  });

  it("handles a single step", () => {
    expect(stepAtFraction([0.4], 0.9)).toBe(0);
  });

  it("copes with repeated positions, as chords produce", () => {
    // Every note of a chord sits at the same place on the line.
    const chorded = [0, 0.2, 0.2, 0.2, 0.6];
    const hit = stepAtFraction(chorded, 0.21);
    expect(hit).toBeGreaterThanOrEqual(1);
    expect(hit).toBeLessThanOrEqual(3);
  });

  it("stays correct across a long score", () => {
    const many = Array.from({ length: 500 }, (_, i) => i / 500);
    expect(stepAtFraction(many, 0.5)).toBe(250);
    expect(stepAtFraction(many, 0.9984)).toBe(499);
  });
});
