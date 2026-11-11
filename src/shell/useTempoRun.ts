import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayedNote } from "../core/NoteInputSource";
import { buildSchedule, stepAtTime, timeline } from "../core/playback";
import { beatGrid, countIn, type Beat } from "../core/pulse";
import type { Hands, Score } from "../core/score";
import { TempoRun } from "../core/tempoRun";
import type { Mark } from "../adapters/osmdScore";

/** The tempo a run starts at, in quarters per minute, and how far it can be set. */
export const TEMPO_DEFAULT = 60;
export const TEMPO_MIN = 30;
export const TEMPO_MAX = 200;
export const TEMPO_STEP = 5;

/**
 * How often the clock is looked at. Fine enough that a beat shows within a
 * frame or two of where it falls; the judging itself does not depend on it,
 * since every note carries its own time.
 */
const TICK_MS = 15;

/** A beat being shown: which of its bar, and whether the music has begun. */
export interface ShownBeat {
  number: number;
  counting: boolean;
  /** Changes with every beat, so the same number twice still flashes twice. */
  serial: number;
}

interface Options {
  score: Score | null;
  hands: Hands;
  /** Quarters per minute at the step the run starts on. */
  bpm: number;
  /** Where the engine stands: the run starts there. */
  from: () => number;
  /** The end of a loop, or null for the end of the piece. */
  until: () => number | null;
  /** Called as the clock reaches each step, so the highlight moves on. */
  onReach: (step: number) => void;
  /** Called when the run is over, with the step it started from. */
  onEnd: (startStep: number) => void;
  markSteps: (marks: ReadonlyMap<number, Mark> | null) => void;
}

/**
 * A run in tempo: the count-in, the clock, and the marks it leaves.
 *
 * The judging is `core/tempoRun.ts`, and the beats are `core/pulse.ts`; this
 * hook only holds the clock that drives them. Everything is timed from one
 * origin on the page's clock — the first beat of the music — and played notes
 * arrive with their strike on that same clock, so a note is placed where it
 * was played and not where it was noticed.
 */
export function useTempoRun(options: Options) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  const runRef = useRef<TempoRun | null>(null);
  /** The page-clock millisecond of the first beat of the music. */
  const originRef = useRef(0);
  const startStepRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<"idle" | "counting" | "running">("idle");
  const [beat, setBeat] = useState<ShownBeat | null>(null);
  const marksRef = useRef(new Map<number, Mark>());

  const clearMarks = useCallback(() => {
    marksRef.current = new Map();
    opts.current.markSteps(null);
  }, []);

  /** Ends the run. Steps whose windows have not closed get no verdict. */
  const finish = useCallback((report: boolean) => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const run = runRef.current;
    runRef.current = null;
    setState("idle");
    setBeat(null);
    if (!run) return;
    if (report) opts.current.onEnd(startStepRef.current);
  }, []);

  const start = useCallback(() => {
    const { score, hands, bpm } = opts.current;
    if (!score || runRef.current) return;

    const from = opts.current.from();
    const step = score.steps[from];
    if (!step) return;

    // The chosen tempo is for the start; tempo changes later in the piece
    // keep their proportion, as they do when a passage is played back.
    const factor = bpm / step.bpm;
    const schedule = buildSchedule(score, from, factor, opts.current.until());
    if (schedule.steps.length === 0) return;

    const clock = timeline(score, from, factor);
    const toSeconds = (b: Beat) => ({ number: b.number, at: clock(b.at) });
    const counted = countIn(score, from).map(toSeconds);
    const pulse = beatGrid(score)
      .filter((b) => b.at >= step.onset - 1e-6)
      .map(toSeconds)
      .filter((b) => b.at <= schedule.duration);
    const beats = [...counted.map((b) => ({ ...b, counting: true })), ...pulse.map((b) => ({ ...b, counting: false }))];

    clearMarks();
    const run = new TempoRun(score, schedule.steps, hands, schedule.duration);
    runRef.current = run;
    startStepRef.current = from;
    // The first beat of the count-in falls now.
    originRef.current = performance.now() - (counted[0]?.at ?? -0.5) * 1000;
    setState("counting");

    let shown = -1;
    let reached = -1;
    const tick = () => {
      const now = (performance.now() - originRef.current) / 1000;

      let current = shown;
      while (current + 1 < beats.length && beats[current + 1].at <= now) current++;
      if (current !== shown && current >= 0) {
        shown = current;
        const b = beats[current];
        setBeat({ number: b.number, counting: b.counting, serial: current });
      }

      if (now >= 0) {
        setState("running");
        const due = stepAtTime(schedule, now);
        if (due !== null && due !== reached) {
          reached = due;
          opts.current.onReach(due);
        }
      }

      const judged = run.settle(now);
      const faults = judged.filter((j) => j.verdict !== "hit");
      if (faults.length > 0) {
        const marks = new Map(marksRef.current);
        for (const { step: s, verdict } of faults) marks.set(s, verdict as Mark);
        marksRef.current = marks;
        opts.current.markSteps(marks);
      }

      if (run.isOver(now)) finish(true);
    };

    tick();
    timerRef.current = setInterval(tick, TICK_MS);
  }, [clearMarks, finish]);

  /** A played note, with its strike on the page's clock. */
  const noteOn = useCallback((note: PlayedNote) => {
    runRef.current?.noteOn(note.midi, (note.time - originRef.current) / 1000);
  }, []);

  /** True from the count-in until the run is over. */
  const isActive = useCallback(() => runRef.current !== null, []);

  // A run belongs to its score: a new piece ends it, and takes its marks along.
  const { score } = options;
  useEffect(() => {
    return () => {
      finish(false);
      marksRef.current = new Map();
    };
  }, [score, finish]);

  return {
    state,
    beat,
    start,
    /** Stops early. The steps already judged keep their marks. */
    stop: useCallback(() => finish(true), [finish]),
    noteOn,
    isActive,
    clearMarks,
  };
}
