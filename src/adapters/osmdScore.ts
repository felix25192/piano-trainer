import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { ExpectedNote, Score, ScoreStep } from "../core/score";

/**
 * Translates what OpenSheetMusicDisplay parsed into the engine's own score
 * model.
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

export function extractScore(osmd: OpenSheetMusicDisplay, title: string): Score {
  const steps: ScoreStep[] = [];
  const cursor = osmd.cursor;

  cursor.reset();

  while (!isAtEnd(cursor) && steps.length < MAX_STEPS) {
    steps.push({
      index: steps.length,
      measure: currentMeasure(cursor),
      notes: notesUnderCursor(cursor),
    });
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

  return { title, steps };
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

function notesUnderCursor(cursor: Cursor): ExpectedNote[] {
  const notes = cursor.NotesUnderCursor();
  if (!notes) return [];

  const collected: ExpectedNote[] = [];

  for (const note of notes) {
    if (note.isRest()) continue;

    const pitch = note.Pitch;
    if (!pitch) continue;

    collected.push({
      // OSMD counts half tones from C0 while MIDI counts from C-1.
      midi: pitch.getHalfTone() + 12,
      staff: staffOf(note),
    });
  }

  return collected;
}

function staffOf(note: unknown): number {
  const id = (note as { ParentStaffEntry?: { ParentStaff?: { Id?: number } } })
    .ParentStaffEntry?.ParentStaff?.Id;
  return typeof id === "number" ? id : 1;
}
