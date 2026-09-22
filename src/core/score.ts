/**
 * The score as the practice engine sees it: a flat list of moments at which
 * the player has to do something. Deliberately much poorer than MusicXML —
 * no beams, no slurs, no layout. Those belong to the renderer.
 */

/** One note the player has to produce at a given step. */
export interface ExpectedNote {
  /** MIDI note number. */
  midi: number;
  /** 1 = upper staff (usually treble), 2 = lower staff (usually bass). */
  staff: number;
  /**
   * How long the note sounds, in whole notes — a quarter is 0.25, a triplet
   * eighth 1/12. Tuplets are already folded in, and so are ties: the note that
   * starts a tie carries the length of the whole chain.
   */
  duration: number;
  /**
   * True when the note is only held over from a tie and is not struck here.
   *
   * Playback has to skip these or a tied note would be hammered again in the
   * middle of its own length. The matcher, for now, does not — it still asks
   * for the key to be pressed a second time, which is wrong on a piano and is
   * noted as open in CLAUDE.md.
   */
  heldOver: boolean;
}

/** One position in the piece at which the player must act. */
export interface ScoreStep {
  /** Position in the piece, starting at 0. */
  index: number;
  /** Measure number as printed in the score, starting at 1. */
  measure: number;
  /** Every note that has to sound together here. Empty for a rest. */
  notes: ExpectedNote[];
  /**
   * When the step falls due, in whole notes from the start of the piece.
   *
   * Counted along the route actually taken, so a repeat advances it rather
   * than sending it back — the steps run in the same order here as they do
   * under the player's hands.
   */
  onset: number;
  /** Quarter notes per minute in force at this step. */
  bpm: number;
}

export interface Score {
  title: string;
  steps: ScoreStep[];
}

/** All distinct MIDI numbers a step requires. */
export function requiredPitches(step: ScoreStep): number[] {
  return [...new Set(step.notes.map((n) => n.midi))].sort((a, b) => a - b);
}

/** A rest, or a step that carries no playable note. */
export function isSilent(step: ScoreStep): boolean {
  return step.notes.length === 0;
}

/** Steps belonging to a measure range, inclusive. Used for section practice. */
export function stepsInMeasures(score: Score, from: number, to: number): ScoreStep[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return score.steps.filter((s) => s.measure >= lo && s.measure <= hi);
}

/** Highest measure number in the score, or 0 when it is empty. */
export function lastMeasure(score: Score): number {
  return score.steps.reduce((max, s) => Math.max(max, s.measure), 0);
}
