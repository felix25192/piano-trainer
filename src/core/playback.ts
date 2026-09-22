import type { Score } from "./score";

/**
 * Turns a score into a list of notes with times in seconds, so it can be heard
 * rather than only read.
 *
 * All the musical thinking happens here and none of the sound: this file knows
 * nothing about Web Audio, oscillators or the browser clock. What leaves it is
 * a plan — this pitch, at this second, for this long — which is exactly the
 * kind of thing a test can check without a speaker.
 *
 * The score counts time in whole notes and gives a tempo in quarter notes per
 * minute, so one whole note lasts `4 * 60 / bpm` seconds. Everything below is
 * that one conversion, applied carefully.
 */

/** One note to sound, timed from the start of the playback. */
export interface ScheduledNote {
  midi: number;
  /** Seconds after the playback begins. */
  start: number;
  /** Seconds. */
  duration: number;
}

/** A step falling due, so the cursor can be moved with the music. */
export interface ScheduledStep {
  /** Index into `score.steps`. */
  index: number;
  /** Seconds after the playback begins. */
  at: number;
}

export interface Schedule {
  notes: ScheduledNote[];
  steps: ScheduledStep[];
  /** Seconds until the last note has finished. */
  duration: number;
}

/**
 * A tempo to fall back on when nothing usable can be read.
 *
 * Rarely reached: a file without a tempo mark still arrives with OSMD's own
 * default of 120, which is what generated exercises play at. This is the guard
 * for the case where even that is missing or nonsense — dividing by it must
 * not produce an infinity, and falling silent would be worse than a guess.
 */
export const FALLBACK_BPM = 90;

/**
 * The shortest a note is allowed to sound.
 *
 * Nothing in the seven bundled pieces produces a zero length, but a grace note
 * or an odd export could, and a note of no duration would be scheduled to end
 * before it began.
 */
const MIN_SECONDS = 0.05;

/**
 * Builds the plan for everything from `fromStep` to the end of the piece.
 *
 * `tempoFactor` scales the speed: 1 plays what is written, 0.5 half as fast.
 * It is applied to the finished times rather than to the tempo, so a tempo
 * change inside the piece keeps its proportion.
 */
export function buildSchedule(
  score: Score,
  fromStep: number,
  tempoFactor = 1,
): Schedule {
  const steps = score.steps;
  const factor = tempoFactor > 0 ? tempoFactor : 1;
  const first = clampIndex(fromStep, steps.length);

  if (first >= steps.length) return { notes: [], steps: [], duration: 0 };

  // Seconds from the start of the piece, for every step. Built once and read
  // repeatedly below, including for positions that fall between two steps.
  const elapsed = secondsPerStep(score);
  const origin = elapsed[first];

  const notes: ScheduledNote[] = [];
  const scheduled: ScheduledStep[] = [];
  let duration = 0;

  for (let i = first; i < steps.length; i++) {
    const step = steps[i];
    const start = (elapsed[i] - origin) / factor;
    scheduled.push({ index: i, at: start });

    for (const note of step.notes) {
      // A tie is one sound, however many notes it is written as. Only the
      // first is struck; the rest are already ringing.
      if (note.heldOver) continue;

      // Measured to the end of the note rather than from its length, so a
      // tempo change underneath a held note is taken into account.
      const end = secondsAt(score, elapsed, step.onset + note.duration);
      const seconds = Math.max((end - elapsed[i]) / factor, MIN_SECONDS);

      notes.push({ midi: note.midi, start, duration: seconds });
      duration = Math.max(duration, start + seconds);
    }
  }

  return { notes, steps: scheduled, duration };
}

/** Which step is due at a given moment — the last one that has started. */
export function stepAtTime(schedule: Schedule, seconds: number): number | null {
  const steps = schedule.steps;
  if (steps.length === 0) return null;

  let lo = 0;
  let hi = steps.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (steps[mid].at <= seconds) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return found === -1 ? null : steps[found].index;
}

/**
 * Seconds from the start of the piece to each step, walking the tempo as the
 * score carries it.
 *
 * Summing step by step is what makes a tempo change land in the right place:
 * the stretch before it keeps the old speed, and only what comes after is
 * slower. Reading a single tempo for the whole piece would shift every note
 * after the change.
 */
function secondsPerStep(score: Score): number[] {
  const steps = score.steps;
  const elapsed = new Array<number>(steps.length);
  let total = 0;

  for (let i = 0; i < steps.length; i++) {
    elapsed[i] = total;
    const next = steps[i + 1];
    if (next) total += wholeNotesToSeconds(next.onset - steps[i].onset, steps[i].bpm);
  }

  return elapsed;
}

/**
 * Seconds to an arbitrary musical position, which a note end usually is —
 * a half note sounds through several steps and rarely stops on one.
 */
function secondsAt(score: Score, elapsed: number[], onset: number): number {
  const steps = score.steps;

  // The last step at or before the position; from there it is one stretch at
  // one tempo.
  let lo = 0;
  let hi = steps.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (steps[mid].onset <= onset) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return elapsed[found] + wholeNotesToSeconds(onset - steps[found].onset, steps[found].bpm);
}

/** One whole note lasts four quarters, and bpm counts quarters per minute. */
function wholeNotesToSeconds(wholeNotes: number, bpm: number): number {
  const tempo = Number.isFinite(bpm) && bpm > 0 ? bpm : FALLBACK_BPM;
  return (wholeNotes * 4 * 60) / tempo;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.floor(index), length);
}
