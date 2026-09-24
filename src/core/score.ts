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
   * Playback skips these, or a tied note would be hammered again in the middle
   * of its own length, and the matcher does not ask for them — see
   * `demandedPitches` for the one exception.
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
  /**
   * When the damper pedal comes up again, in the same whole notes as `onset`,
   * or null when no pedal is down here.
   *
   * Only what the score actually writes. Six of the seven bundled pieces note
   * none at all — including the Moonlight, whose whole character is the raised
   * dampers, because Beethoven wrote it as words rather than as a pedal mark.
   * Inventing one where none is written is a guess, and a wrong pedal sounds
   * worse than no pedal.
   */
  pedalUntil: number | null;
}

export interface Score {
  title: string;
  steps: ScoreStep[];
}

/**
 * Which hands are being practised.
 *
 * The right hand is the upper staff and the left everything below it. That is
 * the notation's answer rather than the anatomy's — a note written across in
 * the other staff follows the staff — but it is what the eye reads, and
 * reading is what is practised.
 */
export type Hands = "both" | "right" | "left";

/** Whether a note belongs to the hands being practised. */
export function inHands(note: ExpectedNote, hands: Hands): boolean {
  if (hands === "both") return true;
  return hands === "right" ? note.staff === 1 : note.staff !== 1;
}

/**
 * The keys a step asks the player to strike, lowest first.
 *
 * Only the chosen hands, and only what is struck here: a note held over from a
 * tie is one sound that is already sounding, and asking for it again would
 * teach the hand to strike it twice. It also could not be heard — a held key
 * makes no new strike for the microphone to notice.
 *
 * The exception is `entering`, the step the position was put on rather than
 * played to: after a tap, a jump to a bar or the end of a passage played back,
 * nothing is sounding yet, and whoever starts in the middle of a tie strikes
 * the note.
 */
export function demandedPitches(step: ScoreStep, hands: Hands = "both", entering = false): number[] {
  const struck = step.notes.filter((n) => inHands(n, hands) && (entering || !n.heldOver));
  return [...new Set(struck.map((n) => n.midi))].sort((a, b) => a - b);
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
