import { describe, expect, it } from "vitest";
import { GRACE, TempoRun } from "./tempoRun";
import type { ScheduledStep } from "./playback";
import type { Score, ScoreStep } from "./score";

/*
 * A run is judged after the fact, so every test plays its notes, lets the
 * clock run out and reads the verdicts. Times are seconds from the first beat.
 */

type Note = ScoreStep["notes"][number];

function note(midi: number, staff = 1, heldOver = false): Note {
  return { midi, staff, duration: 0.25, heldOver };
}

/** Steps one second apart unless times are given; a step with no notes is a rest. */
function run(steps: Note[][], options: { times?: number[]; hands?: "both" | "right" | "left" } = {}) {
  const score: Score = {
    title: "test",
    steps: steps.map((notes, index) => ({
      index,
      measure: 1,
      notes,
      onset: index * 0.25,
      bpm: 60,
      pedalUntil: null,
    })),
  };
  const times = options.times ?? steps.map((_, i) => i);
  const timing: ScheduledStep[] = times.map((at, index) => ({ index, at }));
  const end = times[times.length - 1] + 1;
  return { tempo: new TempoRun(score, timing, options.hands ?? "both", end), end };
}

/** Plays notes as [midi, seconds], then lets the run end and returns the verdicts. */
function judge(r: { tempo: TempoRun; end: number }, ...played: Array<[number, number]>) {
  for (const [midi, at] of played) r.tempo.noteOn(midi, at);
  r.tempo.settle(r.end + GRACE);
  return [...r.tempo.verdicts.values()];
}

describe("judging single notes", () => {
  const scale = () => run([[note(60)], [note(62)], [note(64)]]);

  it("marks notes played on time as hits", () => {
    expect(judge(scale(), [60, 0], [62, 1], [64, 2])).toEqual(["hit", "hit", "hit"]);
  });

  it("lets a note come a little early", () => {
    expect(judge(scale(), [60, 0], [62, 0.9], [64, 2])).toEqual(["hit", "hit", "hit"]);
  });

  it("gives a note that comes too early to the step before it", () => {
    // 0.2 s before step 1 is past the 0.15 s lead: it lands in step 0's window.
    expect(judge(scale(), [60, 0], [62, 0.8], [64, 2])).toEqual(["wrong", "missed", "hit"]);
  });

  it("lets a note come late, as long as the next step is not due", () => {
    expect(judge(scale(), [60, 0], [62, 1.8], [64, 2])).toEqual(["hit", "hit", "hit"]);
  });

  it("marks a step with nothing played as missed", () => {
    expect(judge(scale(), [60, 0], [64, 2])).toEqual(["hit", "missed", "hit"]);
  });

  it("marks a wrong key as wrong", () => {
    expect(judge(scale(), [60, 0], [61, 1], [64, 2])).toEqual(["hit", "wrong", "hit"]);
  });

  it("keeps a wrong key wrong even when the right one follows", () => {
    expect(judge(scale(), [60, 0], [61, 1], [62, 1.2], [64, 2])).toEqual(["hit", "wrong", "hit"]);
  });

  it("counts nothing played during the count-in or after the end", () => {
    expect(judge(scale(), [60, -1], [64, 9])).toEqual(["missed", "missed", "missed"]);
  });

  it("shortens the lead where the steps come quickly", () => {
    // A quarter of 0.2 s is 0.05 s: 0.1 s early is too early here.
    const fast = run([[note(60)], [note(62)]], { times: [0, 0.2] });
    expect(judge(fast, [60, 0], [62, 0.1])).toEqual(["wrong", "missed"]);
  });
});

describe("judging chords", () => {
  const chord = () => run([[note(60), note(64)]]);

  it("wants every note of a chord", () => {
    expect(judge(chord(), [60, 0], [64, 0.05])).toEqual(["hit"]);
  });

  it("marks half a chord as missed", () => {
    expect(judge(chord(), [60, 0])).toEqual(["missed"]);
  });

  it("marks a chord with a foreign note as wrong", () => {
    expect(judge(chord(), [60, 0], [64, 0], [65, 0])).toEqual(["wrong"]);
  });
});

describe("hands, rests and ties", () => {
  it("lets the other hand's notes through while one hand is practised", () => {
    const r = run([[note(64, 1), note(48, 2)]], { hands: "right" });
    expect(judge(r, [64, 0], [48, 0])).toEqual(["hit"]);
  });

  it("gives a rest no verdict, and its time to the step before", () => {
    const r = run([[note(60)], [], [note(64)]]);
    // Played well into the rest: still the first step's window.
    expect(judge(r, [60, 1.5], [64, 2])).toEqual(["hit", "hit"]);
    expect(r.tempo.verdicts.has(1)).toBe(false);
  });

  it("asks for a tie at the first step, since nothing is sounding yet", () => {
    const r = run([[note(60, 1, true)], [note(62)]]);
    expect(judge(r, [60, 0], [62, 1])).toEqual(["hit", "hit"]);
  });

  it("marks a held note struck again as wrong, as the matcher does", () => {
    const r = run([[note(60)], [note(60, 1, true), note(64)]]);
    expect(judge(r, [60, 0], [60, 1], [64, 1])).toEqual(["hit", "wrong"]);
  });
});

describe("when a step is judged", () => {
  it("waits out the grace after its window, for the microphone's late answer", () => {
    const r = run([[note(60)], [note(62)]]);
    // Step 0's window closes at 0.85, where step 1's opens.
    expect(r.tempo.settle(0.85 + GRACE - 0.01)).toEqual([]);
    // The answer arrives late, carrying the time of the strike.
    r.tempo.noteOn(60, 0.5);
    expect(r.tempo.settle(0.85 + GRACE)).toEqual([{ step: 0, verdict: "hit" }]);
  });

  it("does not change a verdict once given", () => {
    const r = run([[note(60)], [note(62)]]);
    r.tempo.settle(0.85 + GRACE);
    r.tempo.noteOn(60, 0.5);
    r.tempo.settle(r.end + GRACE);
    expect(r.tempo.verdicts.get(0)).toBe("missed");
  });

  it("is over once the last window and its grace have passed", () => {
    const r = run([[note(60)]]);
    expect(r.tempo.isOver(r.end)).toBe(false);
    expect(r.tempo.isOver(r.end + GRACE)).toBe(true);
  });
});
