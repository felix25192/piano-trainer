import type { NoteInputSource, NoteListener, PlayedNote } from "../core/NoteInputSource";
import { Hearing, WINDOW, type Heard } from "../core/hearing";
import { audioSession } from "./audioSession";

/**
 * Hears notes through the microphone.
 *
 * The counterpart to `MidiInput`, and the reason the port exists: a cable
 * reports a key press as a fact, this infers a pitch from air. The engine
 * cannot tell them apart, which is what makes the iPad usable at all — Safari
 * has no Web MIDI anywhere, and there is no Mac to build a native wrapper
 * with, so this is not the fallback. It is the way.
 *
 * Monophonic, deliberately. One note at a time covers scales, arpeggios,
 * five-finger exercises and any single line, which is most of what the
 * exercise generator produces. Chords are a different problem and a much
 * harder one — see "Verifikation statt Transkription" in docs/PLAN.md.
 *
 * Thin on purpose. Everything that decides — when a key was struck, when to
 * ask which note it was, what to refuse — is in `core/hearing.ts`, where the
 * bench and the tests run it too. It lived here once, and the bench measured
 * one thing while this ran another; see that file for what that cost.
 */

/** How often the microphone is looked at. The pitch is only worked out on a strike. */
const FRAME_MS = 10;

/** Every strike, including the ones that were refused — for the protocol. */
export type HeardListener = (heard: Heard) => void;

export class MicInput implements NoteInputSource {
  readonly name = "Mikrofon";

  private listeners = new Set<NoteListener>();
  private heardListeners = new Set<HeardListener>();
  private hearing: Hearing | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer = new Float32Array(WINDOW);
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  /** False where the browser cannot record at all. */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(): Promise<void> {
    if (!MicInput.isSupported()) {
      throw new Error("Dieser Browser kann kein Mikrofon öffnen.");
    }

    this.stop();

    // The session owns the device and takes playback down first if it was
    // holding it; the two categories cannot both be held. See core/audioMode.
    const { ctx, stream } = await audioSession.listen();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = WINDOW;
    ctx.createMediaStreamSource(stream).connect(analyser);

    this.analyser = analyser;
    this.buffer = new Float32Array(analyser.fftSize);
    this.hearing = new Hearing(ctx.sampleRate);
    this.startedAt = performance.now();

    this.timer = setInterval(() => this.frame(), FRAME_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.analyser = null;
    this.hearing = null;

    // Only hand the device back if it is ours; playback may have taken it.
    if (audioSession.current === "listening") void audioSession.release();
  }

  onNoteOn(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Every strike and what came of it, refused ones included.
   *
   * Not part of the port: the engine wants notes, nothing else. This is for
   * seeing what the microphone made of the room, which is the only way to
   * tell "heard nothing" from "heard the wrong thing" at the instrument.
   */
  onHeard(listener: HeardListener): () => void {
    this.heardListeners.add(listener);
    return () => {
      this.heardListeners.delete(listener);
    };
  }

  /** One look at the microphone, handed to the core as it is. */
  private frame(): void {
    const { analyser, hearing } = this;
    if (!analyser || !hearing) return;

    analyser.getFloatTimeDomainData(this.buffer);
    const heard = hearing.feed(this.buffer, (performance.now() - this.startedAt) / 1000);
    if (!heard) return;

    for (const listener of this.heardListeners) listener(heard);
    if (heard.midi === null) return;

    const played: PlayedNote = {
      midi: heard.midi,
      time: heard.struckAt * 1000,
      confidence: heard.clarity ?? 0,
    };
    for (const listener of this.listeners) listener(played);
  }
}
