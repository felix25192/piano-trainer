import type { NoteInputSource, NoteListener, PlayedNote } from "../core/NoteInputSource";
import { OnsetDetector } from "../core/onset";
import { detectPitch } from "../core/pitchDetect";
import { frequencyToMidi, isOnPiano } from "../core/pitch";
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
 * Two measurements shape everything here, both from `pitch-lab.html`:
 *
 * A note is recognised 28 times out of 30 in the first fifty milliseconds
 * after the strike and only 15 out of 30 three seconds later, because a
 * piano's fundamental dies before its partials do. So this listens for the
 * *strike* and asks about the pitch once, then waits for the next one.
 *
 * And the pitch is looked for across the whole keyboard, never in a band
 * around the note that happens to be expected. Narrowing is four times faster
 * and waves through 24 of 26 octave errors, because a wave of period T repeats
 * at 2T as well. For a trainer that is the difference between working and
 * lying.
 */

/**
 * The window handed to the detector.
 *
 * 4096 samples are 93 ms at 44.1 kHz and reach down to a note of about 22 Hz,
 * which is below the lowest key. Twice that would cover the very bottom of the
 * piano more safely but costs twice the work, and nothing in the repertoire
 * goes below the C sharp at the bottom of the Moonlight.
 */
const WINDOW = 4096;

/** How often the loudness is looked at. The pitch is only worked out on a strike. */
const FRAME_MS = 10;

/**
 * How sure the detector has to be before a note is passed on.
 *
 * Clarity is what YIN reports about how cleanly the window repeated itself. A
 * held note on the device measured between 0.94 and 1.00; a chord, a cough or
 * a chair scraping sits far below. The engine has its own confidence floor on
 * top of this, so this one only has to keep out what is plainly not a note.
 */
const MIN_CLARITY = 0.8;

/**
 * How far out of tune a note may be and still count, in cents.
 *
 * A semitone is 100, so anything past 50 is nearer the neighbour and would be
 * the wrong note. Well short of that on purpose: a reading that lands halfway
 * between two keys is not a piano note, it is the detector guessing.
 */
const MAX_CENTS = 35;

export class MicInput implements NoteInputSource {
  readonly name = "Mikrofon";

  private listeners = new Set<NoteListener>();
  private onsets = new OnsetDetector();
  private analyser: AnalyserNode | null = null;
  private buffer = new Float32Array(WINDOW);
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private sampleRate = 44100;

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
    this.sampleRate = ctx.sampleRate;
    this.startedAt = performance.now();
    this.onsets.reset();

    this.timer = setInterval(() => this.frame(), FRAME_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.analyser = null;
    this.onsets.reset();

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
   * One look at the microphone.
   *
   * Cheap unless something was struck: a sum over the window either way, and
   * the eight milliseconds of pitch detection only when the strike detector
   * says there is a note to name. At a hundred frames a second that is the
   * difference between a tenth of a core and all of it.
   */
  private frame(): void {
    const analyser = this.analyser;
    if (!analyser) return;

    analyser.getFloatTimeDomainData(this.buffer);

    const now = performance.now();
    const seconds = (now - this.startedAt) / 1000;

    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i];
    const level = Math.sqrt(sum / this.buffer.length);

    if (!this.onsets.feed(level, seconds)) return;

    const found = detectPitch(this.buffer, this.sampleRate);
    if (!found || found.clarity < MIN_CLARITY) return;

    const { midi, cents } = frequencyToMidi(found.hz);
    if (Math.abs(cents) > MAX_CENTS) return;
    if (!isOnPiano(midi)) return;

    const played: PlayedNote = { midi, time: now - this.startedAt, confidence: found.clarity };
    for (const listener of this.listeners) listener(played);
  }
}
