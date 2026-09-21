/**
 * The port through which played notes reach the engine.
 *
 * This is the seam the whole architecture turns on. A MIDI keyboard and a
 * microphone have nothing in common technically — one delivers exact key
 * presses over a cable, the other infers pitches from a spectrum — but the
 * engine only ever sees this interface, so it cannot tell them apart.
 *
 * Adapters live in src/adapters and depend on this file. Nothing here depends
 * on them.
 */

export interface PlayedNote {
  /** MIDI note number of the pitch that was recognised. */
  midi: number;
  /** Milliseconds since the input source was started. */
  time: number;
  /**
   * How sure the source is, from 0 to 1. A MIDI keyboard always reports 1;
   * the microphone reports how well the spectrum matched.
   */
  confidence: number;
}

export type NoteListener = (note: PlayedNote) => void;

export interface NoteInputSource {
  /** Human-readable name for the settings screen, e.g. "Kawai ES520". */
  readonly name: string;

  /** Acquires the device. Rejects when permission is denied or nothing is connected. */
  start(): Promise<void>;

  /** Releases the device. Must be safe to call when never started. */
  stop(): void;

  /** Subscribes to note onsets. Returns an unsubscribe function. */
  onNoteOn(listener: NoteListener): () => void;
}
