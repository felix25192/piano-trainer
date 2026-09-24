import type { PlayedNote } from "./NoteInputSource";
import { demandedPitches, inHands, type Hands, type Score, type ScoreStep } from "./score";

/**
 * Decides whether what was played matches what the score asks for, and moves
 * the position forward when it does.
 *
 * Knows nothing about microphones, MIDI cables, OSMD or React. Everything it
 * needs arrives as a MIDI number; everything it reports leaves as an outcome
 * object. That is what makes it testable without a browser.
 *
 * What it asks for at a step is `demandedPitches` — the chosen hands, and
 * only what is struck there. A step that asks for nothing is passed over the
 * way a rest is, so the position never comes to a stop where there is nothing
 * to do.
 */

export type MatchOutcome =
  /** Correct note, but the chord is not complete yet. */
  | { kind: "progress"; remaining: number[] }
  /** Step satisfied; the position moved on. `to` is null at the end of the piece. */
  | { kind: "advanced"; from: ScoreStep; to: ScoreStep | null }
  /** Note is not part of the current step. The position does not move. */
  | { kind: "wrong"; played: number; expected: number[] }
  /**
   * Nothing to do — already finished, a duplicate press, below the confidence
   * floor, or a note the other hand has here while only one is practised.
   */
  | {
      kind: "ignored";
      reason: "finished" | "duplicate" | "low-confidence" | "other-hand";
    };

export interface MatcherOptions {
  /**
   * Notes reported with less certainty than this are discarded. A MIDI
   * keyboard always reports 1, so this only ever affects the microphone.
   */
  minConfidence?: number;
  /** Which hands are asked for. Both, unless one is being practised alone. */
  hands?: Hands;
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
  private hands: Hands;

  private position = 0;
  private satisfied = new Set<number>();
  private error = false;
  /**
   * True while the position stands where it was put, rather than where
   * playing brought it. Only then is a note held over from a tie asked for —
   * nothing is sounding yet to hold.
   */
  private entering = true;

  constructor(score: Score, options: MatcherOptions = {}) {
    this.score = score;
    this.minConfidence = options.minConfidence ?? 0;
    this.hands = options.hands ?? "both";
    this.position = this.skipIdle(0);
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
    return this.demanded(step).filter((m) => !this.satisfied.has(m));
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

    const expected = this.demanded(step);

    if (!expected.includes(note.midi)) {
      /*
       * The other hand's note, written right here, while one hand is being
       * practised: not what is asked for, but not a misreading either. A tied
       * note struck again is different — it is in the hand being practised,
       * and not seeing the tie is exactly the kind of mistake the red is for.
       */
      if (step.notes.some((n) => n.midi === note.midi && !inHands(n, this.hands))) {
        return { kind: "ignored", reason: "other-hand" };
      }
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

    this.entering = false;
    this.position = this.skipIdle(this.position + 1);
    this.satisfied = new Set();
    return { kind: "advanced", from: step, to: this.currentStep };
  }

  /** Back to the beginning. */
  reset(): void {
    this.enter(0);
  }

  /**
   * Changes which hands are asked for, keeping the place.
   *
   * If the other hand was all that happened here, the position moves on to
   * where the chosen one has something to do.
   */
  setHands(hands: Hands): void {
    this.hands = hands;
    this.enter(this.position);
  }

  /**
   * Jumps to the first step of a measure, for practising a section. Falls back
   * to the end of the piece when the measure holds no playable step.
   */
  seekToMeasure(measure: number): void {
    const index = this.score.steps.findIndex(
      (s) => s.measure >= measure && demandedPitches(s, this.hands, true).length > 0,
    );
    this.enter(index === -1 ? this.score.steps.length : index);
  }

  /**
   * Jumps to a step by index — what tapping a spot in the score resolves to.
   *
   * Out-of-range values are clamped rather than rejected: the caller is a
   * finger on a touch screen, and refusing a tap two pixels past the last note
   * would be worse than starting at the nearest thing there is. Landing on a
   * rest moves on to the next playable step, so the position never comes to a
   * stop somewhere that needs no input.
   */
  seekToStep(index: number): void {
    const clamped = Math.min(Math.max(Math.round(index), 0), this.score.steps.length);
    this.enter(clamped);
  }

  /** Puts the position somewhere, as opposed to playing it there. */
  private enter(index: number): void {
    this.entering = true;
    this.position = this.skipIdle(index);
    this.satisfied = new Set();
    this.error = false;
  }

  private demanded(step: ScoreStep): number[] {
    return demandedPitches(step, this.hands, this.entering);
  }

  /**
   * Steps that ask for nothing — rests, the other hand's notes, a tie being
   * held — need no input, so the position never comes to a stop on one.
   * Skipping them here keeps that rule in a single place.
   */
  private skipIdle(from: number): number {
    let i = from;
    while (i < this.score.steps.length && this.demanded(this.score.steps[i]).length === 0) i++;
    return i;
  }
}
