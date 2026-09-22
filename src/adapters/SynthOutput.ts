import type { NoteOutput } from "../core/NoteOutput";
import type { ScheduledNote } from "../core/playback";

/**
 * Makes the notes audible with Web Audio, without loading a single sample.
 *
 * This is an adapter and knows nothing about the score: it is handed pitches
 * and seconds and turns them into sound. Which note, when and how long was
 * decided in `core/playback.ts`.
 *
 * It does not pretend to be a grand piano. What it aims for is a tone that is
 * struck rather than switched on — a bright attack that darkens as it decays,
 * low notes ringing longer than high ones — because rhythm and line are what
 * this is for. Swapping in recorded samples later means another file beside
 * this one; nothing above the `NoteOutput` port would notice.
 */

/** True when this browser can make a sound at all. */
export function isAudioSupported(): boolean {
  return typeof AudioContext !== "undefined";
}

/**
 * How far ahead notes are handed to the audio clock, and how often that is
 * done.
 *
 * The timer is only a nudge, never the thing that decides when a note sounds —
 * `setInterval` drifts and jitters under load, and either would be audible as
 * bad rhythm. It merely wakes up often enough to keep the window filled, and
 * the exact moment comes from `AudioContext.currentTime`, which is counted in
 * samples.
 *
 * The window is two seconds rather than the fifth of a second a lookahead
 * scheduler usually needs, because a browser throttles timers in a tab that is
 * not on screen — to once a second, and eventually far less. Web Audio itself
 * plays on regardless, so a short window would run dry the moment the app is
 * switched away from, and the notes would pile up in a burst on return. Two
 * seconds of music already in the audio clock's hands survives that.
 */
const LOOKAHEAD_SECONDS = 2;
const TICK_MS = 150;

/**
 * A moment of silence before the first note.
 *
 * Starting a context, building the wave and scheduling the opening chord all
 * happen inside the tap that asked for it. Without a little air the first note
 * can be scheduled for a moment that has already passed, and it arrives late
 * or not at all.
 */
const LEAD_IN_SECONDS = 0.08;

const ATTACK_SECONDS = 0.006;
/** Exponential fall after the key is released, as a time constant. */
const RELEASE_TAU = 0.06;
/** Near enough to silence for an exponential ramp, which cannot reach zero. */
const SILENT = 0.0001;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class SynthOutput implements NoteOutput {
  private ctx: AudioContext | null = null;
  private master: DynamicsCompressorNode | null = null;
  private wave: PeriodicWave | null = null;

  private notes: readonly ScheduledNote[] = [];
  private next = 0;
  private startedAt = 0;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private voices: Voice[] = [];

  start(notes: readonly ScheduledNote[]): void {
    if (!isAudioSupported()) return;

    this.stop();

    const ctx = this.context();
    // A context can come up suspended; on iOS it always does. This has to
    // happen inside the gesture that called us, which is why starting playback
    // is a tap and never an effect.
    void ctx.resume();

    this.notes = notes;
    this.next = 0;
    this.startedAt = ctx.currentTime + LEAD_IN_SECONDS;
    this.playing = true;

    this.schedule();
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playing = false;
    this.notes = [];
    this.next = 0;

    const ctx = this.ctx;
    if (!ctx) return;

    // Cut the sound with a short fade rather than by pulling the plug: an
    // oscillator stopped mid-cycle clicks.
    const now = ctx.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, SILENT), now);
      voice.gain.gain.setTargetAtTime(SILENT, now, RELEASE_TAU / 2);
      try {
        voice.osc.stop(now + RELEASE_TAU * 4);
      } catch {
        // Already stopped; its onended has simply not run yet.
      }
    }
    this.voices = [];
  }

  elapsed(): number | null {
    if (!this.playing || !this.ctx) return null;
    return Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.wave = null;
  }

  /** Hands the audio clock everything that falls due in the next window. */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;

    const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;
    while (this.next < this.notes.length) {
      const note = this.notes[this.next];
      const at = this.startedAt + note.start;
      if (at >= horizon) break;
      this.voice(note, at);
      this.next++;
    }

    // Everything is in the audio clock's hands now; the timer has no work
    // left. Playback is still running, and `elapsed` still reports it.
    if (this.next >= this.notes.length && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One struck note.
   *
   * The filter is what makes it sound hit rather than blown: it opens bright
   * on the attack and closes within a quarter second, which is roughly what a
   * string does as its upper partials die away first. The gain envelope then
   * decays on its own, slowly low down and quickly up top, and is damped when
   * the written length runs out.
   */
  private voice(note: ScheduledNote, at: number): void {
    const ctx = this.ctx;
    const master = this.master;
    const wave = this.wave;
    if (!ctx || !master || !wave) return;

    const frequency = 440 * Math.pow(2, (note.midi - 69) / 12);
    const end = at + note.duration;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(frequency, at);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    const open = Math.min(frequency * 14, ctx.sampleRate / 2 - 1000);
    filter.frequency.setValueAtTime(open, at);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(frequency * 3, 200),
      at + 0.25,
    );

    const gain = ctx.createGain();
    // Higher notes carry less weight, or a melody up top drowns the bass.
    const peak = 0.3 * Math.pow(2, -(note.midi - 48) / 60);
    // Low strings ring for seconds, the top of the keyboard for well under one.
    const decayTau = 3.2 * Math.pow(2, -(note.midi - 33) / 24);

    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + ATTACK_SECONDS);
    gain.gain.setTargetAtTime(peak * 0.2, at + ATTACK_SECONDS, decayTau);
    // The damper falling as the note ends.
    gain.gain.setTargetAtTime(SILENT, end, RELEASE_TAU);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    const voice: Voice = { osc, gain };
    this.voices.push(voice);

    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.voices = this.voices.filter((v) => v !== voice);
    };

    osc.start(at);
    osc.stop(end + RELEASE_TAU * 6);
  }

  private context(): AudioContext {
    if (this.ctx) return this.ctx;

    const ctx = new AudioContext();

    // A safety net, not an effect: five notes at once would otherwise clip,
    // and clipping in a browser is a nasty crackle rather than a warm one.
    const master = ctx.createDynamicsCompressor();
    master.threshold.value = -12;
    master.ratio.value = 6;
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.wave = pianoWave(ctx);
    return ctx;
  }
}

/**
 * The harmonic recipe for one note.
 *
 * A piano string is rich low down and drops away quickly above the fifth
 * partial. These numbers are that shape by ear, not a measurement of any
 * particular instrument. The first entry is the constant term and has to stay
 * zero, or every note would carry a DC offset.
 */
function pianoWave(ctx: AudioContext): PeriodicWave {
  const partials = [0, 1, 0.42, 0.28, 0.15, 0.09, 0.055, 0.035, 0.022, 0.014, 0.009];
  return ctx.createPeriodicWave(
    new Float32Array(partials.length),
    Float32Array.from(partials),
    { disableNormalization: false },
  );
}
