import type { ScheduledNote } from "./playback";

/**
 * The port every sound output implements — the mirror image of
 * `NoteInputSource`. One side lets the instrument drive the app, this one lets
 * the app drive an instrument.
 *
 * It is deliberately narrow. The caller hands over a finished plan and asks
 * the clock where it stands; it never asks for a note to be played *now*,
 * because "now" is exactly what a JavaScript timer cannot promise. Scheduling
 * ahead against the audio clock is the whole point, and that belongs to the
 * adapter.
 */
export interface NoteOutput {
  /**
   * Starts the notes. Times in the plan count from the start of the playback,
   * not from any clock the caller can see.
   *
   * Must be called from a user gesture: browsers refuse to make a sound
   * otherwise, and iOS is strict about it. The promise it returns settles once
   * the sound is actually under way — an output that has recordings to fetch
   * needs a moment first, and the caller has to be able to say so rather than
   * look broken. It rejects when nothing can be played at all.
   */
  start(notes: readonly ScheduledNote[]): Promise<void>;

  /** Silences everything immediately. Safe to call when nothing is playing. */
  stop(): void;

  /**
   * Seconds since the playback began, or null when nothing is playing.
   *
   * Read this rather than counting frames or adding up timer intervals: it is
   * the same clock the notes are scheduled against, so the cursor and the
   * sound cannot drift apart.
   */
  elapsed(): number | null;

  /** Releases the audio hardware. The output is unusable afterwards. */
  dispose(): void;
}
