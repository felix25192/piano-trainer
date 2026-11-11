import { describe, expect, it } from "vitest";
import type { Heard } from "./hearing";
import { formatLog, verdictOf, type LogEntry } from "./sessionLog";

function heard(midi: number | null, over: Partial<Heard> = {}): Heard {
  return {
    struckAt: 0,
    answeredAt: 0.1,
    by: "loudness",
    level: 0.0123,
    flux: 3.21,
    midi,
    clarity: midi === null ? null : 0.95,
    cents: midi === null ? null : -7,
    refused: midi === null ? "unclear" : null,
    ...over,
  };
}

describe("how a strike is taken", () => {
  it("tells right from wrong from refused", () => {
    expect(verdictOf(heard(62), [62])).toBe("right");
    expect(verdictOf(heard(63), [62])).toBe("wrong");
    expect(verdictOf(heard(null), [62])).toBe("refused");
  });
});

describe("the log as text", () => {
  const entries: LogEntry[] = [
    { kind: "heard", at: 1.234, heard: heard(63), expected: [62], where: { measure: 3, step: 9 } },
    { kind: "key", at: 1.19, event: { kind: "down", midi: 62, velocity: 64, time: 0 } },
    { kind: "heard", at: 2.5, heard: heard(null), expected: [64], where: null },
    { kind: "key", at: 2.0, event: { kind: "pedal", down: true, time: 0 } },
  ];
  const lines = formatLog(entries, ["Stück: Test"]).split("\n");

  it("starts with the header and a blank line", () => {
    expect(lines.slice(0, 2)).toEqual(["Stück: Test", ""]);
  });

  it("puts everything in the order it happened, so a key and its strike sit together", () => {
    expect(lines[2]).toMatch(/^1\.19 s {2}MIDI ↓ D4 \(64\)$/);
    expect(lines[3]).toMatch(/^1\.23 s {2}T\. 3/);
    expect(lines[4]).toBe("2.00 s  MIDI Pedal ↓");
    expect(lines[5]).toMatch(/^2\.50 s/);
  });

  it("names a heard black key both ways, and says what was expected and how it was taken", () => {
    expect(lines[3]).toContain("gehört D♯4/E♭4");
    expect(lines[3]).toContain("erwartet D4");
    expect(lines[3]).toContain("falsch");
    expect(lines[3]).toContain("Pegel 0.012 · Fluss 3.2");
    expect(lines[3]).toContain("Klarheit 0.95");
    expect(lines[3]).toContain("-7 ct");
  });

  it("says why a strike was refused", () => {
    expect(lines[5]).toContain("nichts (unklar)");
    expect(lines[5]).toContain("verworfen");
  });
});
