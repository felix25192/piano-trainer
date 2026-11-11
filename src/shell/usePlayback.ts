import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteOutput } from "../core/NoteOutput";
import { buildSchedule, stepAtTime, type Schedule } from "../core/playback";
import type { Score } from "../core/score";
import { SampledPiano } from "../adapters/SampledPiano";
import { describeError } from "./format";

/**
 * How long to keep the playback alive after the last note is due.
 *
 * Stopping the moment the written length runs out would cut the damper off
 * mid-fall and leave a click where the piece should fade. A few tenths cover
 * the release the output puts on every note.
 */
const PLAYBACK_TAIL_SECONDS = 0.5;

/**
 * How often the highlight checks where the sound has got to.
 *
 * Fine enough that no note is missed even in the fastest passage, coarse
 * enough not to wake up for nothing between them.
 */
const FOLLOW_MS = 40;

/**
 * How long playback may go without the audio clock moving before it is given
 * up on.
 *
 * The clock stopping is what an interrupted audio session looks like from up
 * here: notes are scheduled, nothing sounds, and the stop button sits there lit
 * forever. Better to say so.
 */
const STALL_SECONDS = 2;

/**
 * Speeds offered for playing a passage back, as a share of what is written.
 *
 * The score's own tempo is the default, because hearing it as meant is the
 * point. But the marks in these files are performance tempi — the Beethoven
 * asks for 180 — and a passage you cannot follow teaches nothing, so the
 * slower steps are there for a first pass.
 */
export const TEMPO_FACTORS: Array<[number, string]> = [
  [0.5, "50 %"],
  [0.75, "75 %"],
  [1, "wie notiert"],
];

/**
 * Idle, fetching recordings, or sounding.
 *
 * Loading is its own state rather than a flag beside "playing", because the
 * first press of a session waits on a couple of megabytes of piano and the
 * button has to say so instead of looking dead.
 */
export type PlaybackState = "idle" | "loading" | "playing";

interface Options {
  score: Score | null;
  tempoFactor: number;
  /** Where the engine stands. A passage plays from there. */
  from: () => number;
  /** Called as the sound reaches each step, so the highlight can keep up. */
  onReach: (step: number) => void;
}

/**
 * Plays the passage from the highlight, and stops on a second press.
 *
 * The engine's position is both where it starts and where it ends up, so
 * listening to a passage leaves you ready to play the next one — rather than
 * somewhere a separate playback marker happened to stop.
 */
export function usePlayback({ score, tempoFactor, from, onReach }: Options) {
  /** The sound output, built on the first tap of play and kept afterwards. */
  const outputRef = useRef<NoteOutput | null>(null);
  /** What is currently being played back. Set from the press until the stop. */
  const scheduleRef = useRef<Schedule | null>(null);
  /** The timer that keeps the highlight on the note being heard. */
  const followRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Wall clock at the start, to notice an audio clock that stops. */
  const startedWallRef = useRef(0);
  const onReachRef = useRef(onReach);
  useEffect(() => {
    onReachRef.current = onReach;
  });

  const [state, setState] = useState<PlaybackState>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (followRef.current !== null) {
      clearInterval(followRef.current);
      followRef.current = null;
    }
    outputRef.current?.stop();
    scheduleRef.current = null;
    setState("idle");
  }, []);

  /**
   * Keeps the highlight on the note being heard.
   *
   * It asks the output where it stands rather than counting frames or adding
   * up intervals, because that is the same clock the notes are scheduled
   * against. Anything else would drift, and a highlight half a bar away from
   * the sound is worse than none.
   *
   * Driven by a timer and not by `requestAnimationFrame`, although this moves
   * something on screen. Animation frames stop entirely while the window is
   * not drawing, and the sound does not — so the piece would finish unheard by
   * the app, leaving the stop button lit and the position frozen mid-piece.
   * A timer is throttled there rather than halted, which is enough to notice
   * that the last note has gone. Nothing is animated here anyway: the highlight
   * moves once per note, not once per frame.
   */
  const follow = useCallback(() => {
    const schedule = scheduleRef.current;
    const elapsed = outputRef.current?.elapsed();

    if (!schedule || elapsed === null || elapsed === undefined) {
      stop();
      return;
    }

    // The audio clock has not moved although real time has: the device took
    // the audio session away mid-passage.
    if (elapsed <= 0 && (performance.now() - startedWallRef.current) / 1000 > STALL_SECONDS) {
      stop();
      setError(
        "Der Ton wurde vom Gerät angehalten. Andere Seiten oder Apps schliessen, " +
          "die das Mikrofon benutzen, und den Stummschalter prüfen.",
      );
      return;
    }

    const due = stepAtTime(schedule, elapsed);
    if (due !== null) onReachRef.current(due);

    if (elapsed >= schedule.duration + PLAYBACK_TAIL_SECONDS) stop();
  }, [stop]);

  async function toggle() {
    if (state !== "idle") {
      stop();
      return;
    }
    if (!score) return;

    const schedule = buildSchedule(score, from(), tempoFactor);
    if (schedule.notes.length === 0) return;

    // Built on the first press rather than on mount: a browser hands out sound
    // only from inside a gesture, and iOS is strict about it.
    const output = (outputRef.current ??= new SampledPiano());

    scheduleRef.current = schedule;
    setError(null);
    setState("loading");

    try {
      await output.start(schedule.notes);
    } catch (e: unknown) {
      stop();
      setError(describeError(e));
      return;
    }

    // The press may have been taken back while the recordings were still
    // coming in, in which case the output quietly declined to start.
    if (output.elapsed() === null) return;

    setState("playing");
    startedWallRef.current = performance.now();
    follow();
    followRef.current = setInterval(follow, FOLLOW_MS);
  }

  // The schedule belongs to the score; when that goes, so does the sound.
  useEffect(() => stop, [score, stop]);

  // The audio hardware outlives every piece, so it is only given back when the
  // app itself goes away.
  useEffect(() => {
    return () => {
      if (followRef.current !== null) clearInterval(followRef.current);
      outputRef.current?.dispose();
      outputRef.current = null;
    };
  }, []);

  return {
    state,
    error,
    toggle,
    stop,
    clearError: useCallback(() => setError(null), []),
    /** True from the press until the stop, loading included. */
    isActive: useCallback(() => scheduleRef.current !== null, []),
  };
}
