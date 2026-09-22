import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { FALLBACK_BPM } from "../core/playback";
import type { ExpectedNote, Score, ScoreStep } from "../core/score";

/**
 * Translates what OpenSheetMusicDisplay parsed into the engine's own score
 * model, and records where each step sits along the staff line.
 *
 * This is an adapter, and it is deliberately the only file in the project that
 * is allowed to know about OSMD's object graph. Keep it thin: it walks, it
 * copies, it makes no decisions. Everything worth testing lives in src/core,
 * which is why there is no test beside this file.
 */

/**
 * OSMD's cursor has no "length" to check against, so a runaway iterator would
 * hang the tab. No piano piece comes near this many note positions.
 */
const MAX_STEPS = 100_000;

export interface ReadScore {
  score: Score;
  /**
   * Where each step sits horizontally, as a fraction of the whole staff line
   * from 0 to 1 — not as pixels.
   *
   * Pixels would be wrong the moment the engraving is re-rendered at a
   * different zoom, and the app re-renders on every rotation. Proportions
   * survive that, because OSMD scales the whole layout uniformly. Turning one
   * back into a pixel position is a multiplication by the current width.
   */
  anchors: number[];
}

export function extractScore(
  osmd: OpenSheetMusicDisplay,
  title: string,
  /** The element OSMD renders into. Its own `container` is protected. */
  host: HTMLElement | null,
): ReadScore {
  const steps: ScoreStep[] = [];
  const anchors: number[] = [];
  const cursor = osmd.cursor;
  // Tempo is read per measure, not once for the sheet. Two reasons: a piece
  // can change tempo — the C major prelude drops from 72 to 30 for its last
  // two bars — and the sheet-wide default is not always filled in. The
  // Beethoven leaves it undefined while every one of its measures says 180.
  const measures = osmd.Sheet?.SourceMeasures ?? [];

  // Two layout reads for the whole walk; everything after this is arithmetic.
  const sheetWidth = host?.querySelector("svg")?.getBoundingClientRect().width ?? 0;
  const cursorWidth = cursorElement(cursor)?.offsetWidth ?? 0;

  cursor.reset();

  while (!isAtEnd(cursor) && steps.length < MAX_STEPS) {
    const measure = currentMeasure(cursor);
    steps.push({
      index: steps.length,
      measure,
      notes: notesUnderCursor(cursor),
      onset: currentOnset(cursor),
      bpm: tempoOf(measures[measure - 1]),
    });
    anchors.push(sheetWidth > 0 ? cursorFraction(cursor, sheetWidth, cursorWidth) : 0);
    cursor.next();
  }

  // Leave the cursor where the caller found it — this function reads, it does
  // not consume.
  cursor.reset();

  if (steps.length >= MAX_STEPS) {
    throw new Error(
      `Score walk hit the ${MAX_STEPS} step ceiling; the cursor is probably not advancing.`,
    );
  }

  return { score: { title, steps }, anchors };
}

/** Finds the step nearest a point given as a fraction of the staff line. */
export function stepAtFraction(anchors: number[], fraction: number): number {
  if (anchors.length === 0) return 0;

  // Anchors are produced in order, so a binary search is safe.
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid] < fraction) lo = mid + 1;
    else hi = mid;
  }

  // `lo` is the first anchor at or past the point; the one before it may be
  // closer. A tap lands between two notes as often as on one.
  if (lo > 0 && Math.abs(anchors[lo - 1] - fraction) <= Math.abs(anchors[lo] - fraction)) {
    return lo - 1;
  }
  return lo;
}

type Cursor = OpenSheetMusicDisplay["cursor"];

function isAtEnd(cursor: Cursor): boolean {
  // `iterator` is public on the Cursor but not part of the published typings
  // in every release, hence the narrow cast rather than a blanket `any`.
  const iterator = (cursor as unknown as { iterator?: { EndReached?: boolean } }).iterator;
  return iterator?.EndReached ?? true;
}

function currentMeasure(cursor: Cursor): number {
  const iterator = (cursor as unknown as {
    iterator?: { CurrentMeasureIndex?: number };
  }).iterator;
  // OSMD counts measures from zero; printed scores count from one.
  return (iterator?.CurrentMeasureIndex ?? 0) + 1;
}

/**
 * How far into the piece the cursor stands, in whole notes.
 *
 * The *enrolled* timestamp, not the source one: it counts the route actually
 * taken, so a repeat carries it onward instead of sending it back to where the
 * repeated bars were first printed. That matters here because the walk itself
 * follows the same route — the Bach minuet is 32 bars on paper and 64 under
 * the hands — and a playback built on source timestamps would jump backwards
 * in the middle of a piece the player is moving forwards through.
 */
function currentOnset(cursor: Cursor): number {
  const iterator = (cursor as unknown as {
    iterator?: { CurrentEnrolledTimestamp?: { RealValue?: number } };
  }).iterator;
  return iterator?.CurrentEnrolledTimestamp?.RealValue ?? 0;
}

/** Quarter notes per minute in a measure, or a practice tempo if it names none. */
function tempoOf(measure: { TempoInBPM?: number } | undefined): number {
  const bpm = measure?.TempoInBPM;
  return typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 ? bpm : FALLBACK_BPM;
}

function cursorElement(cursor: Cursor): HTMLElement | undefined {
  return (cursor as unknown as { cursorElement?: HTMLElement }).cursorElement;
}

/**
 * Where a step sits along the staff line, as a fraction of the total width.
 *
 * Measured at the **centre** of the highlight, not its left edge. The
 * highlight straddles the notehead, so its left edge sits noticeably before
 * the note it marks — anchoring there biased every tap towards the following
 * note, which made hitting the intended one unexpectedly fiddly.
 *
 * The position comes from the inline style rather than `offsetLeft`, because
 * OSMD sets that style itself and reading the string costs nothing;
 * `offsetLeft` would force a fresh layout on every one of several hundred
 * steps. The width is passed in, measured once for the whole walk.
 */
function cursorFraction(cursor: Cursor, sheetWidth: number, cursorWidth: number): number {
  const el = cursorElement(cursor);
  if (!el) return 0;

  const styled = Number.parseFloat(el.style.left);
  const left = Number.isFinite(styled) ? styled : el.offsetLeft;
  return (left + cursorWidth / 2) / sheetWidth;
}

function notesUnderCursor(cursor: Cursor): ExpectedNote[] {
  const notes = cursor.NotesUnderCursor();
  if (!notes) return [];

  const collected: ExpectedNote[] = [];

  for (const note of notes) {
    if (note.isRest()) continue;

    const pitch = note.Pitch;
    if (!pitch) continue;

    /*
     * A tie is one sound written as several notes. The first of them carries
     * the length of the whole chain, the rest are already ringing and are
     * flagged so that playback does not strike them again.
     */
    const tie = note.NoteTie;
    const heldOver = tie ? tie.StartNote !== note : false;
    const tieLength = tie?.Duration?.RealValue;
    const ownLength = note.Length?.RealValue ?? 0;

    collected.push({
      // OSMD counts half tones from C0 while MIDI counts from C-1.
      midi: pitch.getHalfTone() + 12,
      staff: staffOf(note),
      // Tuplets need no arithmetic here: OSMD has already divided them, so a
      // triplet eighth arrives as 1/12 of a whole note.
      duration: !heldOver && typeof tieLength === "number" ? tieLength : ownLength,
      heldOver,
    });
  }

  return collected;
}

function staffOf(note: unknown): number {
  const id = (note as { ParentStaffEntry?: { ParentStaff?: { Id?: number } } })
    .ParentStaffEntry?.ParentStaff?.Id;
  return typeof id === "number" ? id : 1;
}
