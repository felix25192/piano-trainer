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
}

/** One position in the piece at which the player must act. */
export interface ScoreStep {
  /** Position in the piece, starting at 0. */
  index: number;
  /** Measure number as printed in the score, starting at 1. */
  measure: number;
  /** Every note that has to sound together here. Empty for a rest. */
  notes: ExpectedNote[];
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
