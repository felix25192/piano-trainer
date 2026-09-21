import type { PlayedNote } from "./NoteInputSource";
import { isSilent, requiredPitches, type Score, type ScoreStep } from "./score";

/**
 * Decides whether what was played matches what the score asks for, and moves
 * the position forward when it does.
 *
 * Knows nothing about microphones, MIDI cables, OSMD or React. Everything it
 * needs arrives as a MIDI number; everything it reports leaves as an outcome
 * object. That is what makes it testable without a browser.
 */

export type MatchOutcome =
  /** Correct note, but the chord is not complete yet. */
  | { kind: "progress"; remaining: number[] }
  /** Step satisfied; the position moved on. `to` is null at the end of the piece. */
  | { kind: "advanced"; from: ScoreStep; to: ScoreStep | null }
  /** Note is not part of the current step. The position does not move. */
  | { kind: "wrong"; played: number; expected: number[] }
  /** Nothing to do — already finished, duplicate press, or below the confidence floor. */
  | { kind: "ignored"; reason: "finished" | "duplicate" | "low-confidence" };

export interface MatcherOptions {
  /**
   * Notes reported with less certainty than this are discarded. A MIDI
   * keyboard always reports 1, so this only ever affects the microphone.
   */
  minConfidence?: number;
}

export interface MatcherProgress {
  stepIndex: number;
  totalSteps: number;
  measure: number;
  /** Notes of the current step that have not been played yet. */
  remaining: number[];
  /** True after a wrong note, until the next correct one. */
  hasError: boolean;
  finished: boolean;
}

export class NoteMatcher {
  private readonly score: Score;
  private readonly minConfidence: number;

  private position = 0;
  private satisfied = new Set<number>();
  private error = false;

  constructor(score: Score, options: MatcherOptions = {}) {
    this.score = score;
    this.minConfidence = options.minConfidence ?? 0;
    this.position = this.skipSilent(0);
  }

  /** The step awaiting input, or null once the piece is done. */
  get currentStep(): ScoreStep | null {
    return this.score.steps[this.position] ?? null;
  }

  get finished(): boolean {
    return this.position >= this.score.steps.length;
  }

  get hasError(): boolean {
    return this.error;
  }

  /** Notes of the current step that still have to be played. */
  get remaining(): number[] {
    const step = this.currentStep;
    if (!step) return [];
    return requiredPitches(step).filter((m) => !this.satisfied.has(m));
  }

  get progress(): MatcherProgress {
    return {
      stepIndex: this.position,
      totalSteps: this.score.steps.length,
      measure: this.currentStep?.measure ?? 0,
      remaining: this.remaining,
      hasError: this.error,
      finished: this.finished,
    };
  }

  /** Feeds one played note in and reports what it did. */
  noteOn(note: PlayedNote): MatchOutcome {
    if (note.confidence < this.minConfidence) {
      return { kind: "ignored", reason: "low-confidence" };
    }

    const step = this.currentStep;
    if (!step) return { kind: "ignored", reason: "finished" };

    const expected = requiredPitches(step);

    if (!expected.includes(note.midi)) {
      this.error = true;
      return { kind: "wrong", played: note.midi, expected };
    }

    if (this.satisfied.has(note.midi)) {
      return { kind: "ignored", reason: "duplicate" };
    }

    // A correct note clears a previous mistake — the player recovered.
    this.error = false;
    this.satisfied.add(note.midi);

    const remaining = this.remaining;
    if (remaining.length > 0) return { kind: "progress", remaining };

    this.position = this.skipSilent(this.position + 1);
    this.satisfied = new Set();
    return { kind: "advanced", from: step, to: this.currentStep };
  }

  /** Back to the beginning. */
  reset(): void {
    this.position = this.skipSilent(0);
    this.satisfied = new Set();
    this.error = false;
  }

  /**
   * Jumps to the first step of a measure, for practising a section. Falls back
   * to the end of the piece when the measure holds no playable step.
   */
  seekToMeasure(measure: number): void {
    const index = this.score.steps.findIndex(
      (s) => s.measure >= measure && !isSilent(s),
    );
    this.position = index === -1 ? this.score.steps.length : index;
    this.satisfied = new Set();
    this.error = false;
  }

  /**
   * Rests need no input, so the position never comes to a stop on one.
   * Skipping them here keeps that rule in a single place.
   */
  private skipSilent(from: number): number {
    let i = from;
    while (i < this.score.steps.length && isSilent(this.score.steps[i])) i++;
    return i;
  }
}
