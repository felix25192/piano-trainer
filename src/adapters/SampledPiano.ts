import type { NoteOutput } from "../core/NoteOutput";
import type { ScheduledNote } from "../core/playback";

/**
 * Plays the notes from recordings of a real piano.
 *
 * An adapter, and like the others it makes no musical decisions: it is handed
 * pitches and seconds and turns them into sound. Which note, when and how long
 * was settled in `core/playback.ts`.
 *
 * The recordings are the Salamander Grand Piano, a Yamaha C5 sampled every
 * minor third; `public/piano/SOURCES.md` says where they came from and under
 * what licence. Every minor third means no note is ever shifted by more than a
 * semitone, which is small enough not to sound stretched.
 */

/**
 * The recordings, lowest first, three semitones apart from A0 to C8 — the
 * range of a full keyboard.
 *
 * Written out rather than derived from the pitch, because these are file names
 * and have to match the set's own spelling exactly. The order is what carries
 * the pitch: entry `i` sounds A0 plus three semitones per step.
 */
const SAMPLES = [
  "A0", "C1", "Ds1", "Fs1",
  "A1", "C2", "Ds2", "Fs2",
  "A2", "C3", "Ds3", "Fs3",
  "A3", "C4", "Ds4", "Fs4",
  "A4", "C5", "Ds5", "Fs5",
  "A5", "C6", "Ds6", "Fs6",
  "A6", "C7", "Ds7", "Fs7",
  "A7", "C8",
];

/** MIDI number of the first recording, and the gap between them. */
const LOWEST_MIDI = 21;
const SEMITONES_APART = 3;

/**
 * How much of each recording is kept.
 *
 * They run up to twenty-five seconds, following a low string all the way down
 * into silence, and decoded in full the set costs 142 MB of memory — enough to
 * have the tab thrown away on a tablet. Nothing needs that tail: a note is
 * damped when its written length runs out, and the longest note in the
 * bundled pieces is a whole note at 44, which is five and a half seconds, or
 * eleven at half speed. Twelve seconds covers it, and with the recordings
 * folded down to mono the set costs 50 MB — less in practice, since a piece
 * only ever calls for the registers it actually uses.
 */
const MAX_SAMPLE_SECONDS = 12;
/** A recording cut mid-decay would end on a step, which clicks. */
const FADE_SECONDS = 0.35;

const LOOKAHEAD_SECONDS = 2;
const TICK_MS = 150;
const LEAD_IN_SECONDS = 0.08;
const SILENT = 0.0001;

/**
 * Loudness of one note, and of everything together.
 *
 * Measured, not guessed. Folded to mono the recordings peak between 0.08 and
 * 0.31 of full scale, around 0.2 for a typical note — played straight they are
 * far too quiet on a tablet speaker.
 *
 * The figure comes from metering the output. At twice the level the first bars
 * of the Bach minuet already reached 0.897, which leaves nothing for a piece
 * that puts four notes under each hand. At 1.6, six bars of the same minuet
 * peak at 0.861 and the Chopin nocturne — the densest of the seven — at 0.888,
 * so nothing clips and the limiter still has somewhere to work.
 *
 * The limiter catches whatever still gets past that. It sits high on purpose:
 * a threshold low enough to be working constantly would flatten the very
 * difference between a chord and a single note that makes a piano sound like
 * one. Clipping in a browser is a harsh crackle, not a warm one, so something
 * has to stand there — but it should be idle nearly all of the time.
 */
const NOTE_LEVEL = 1;
const MASTER_LEVEL = 1.6;
/** Decibels below full scale; -3 dB is about 0.7. */
const LIMIT_DB = -3;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class SampledPiano implements NoteOutput {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private loading = new Map<number, Promise<AudioBuffer>>();

  private notes: readonly ScheduledNote[] = [];
  private next = 0;
  private startedAt = 0;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private voices: Voice[] = [];
  /**
   * Bumped by every stop, so a fetch that was still running when the user
   * changed their mind finds out that it is no longer wanted.
   */
  private generation = 0;

  async start(notes: readonly ScheduledNote[]): Promise<void> {
    this.stop();
    // Again on every start, not only at construction: Safari may not have had
    // a session to configure the first time.
    claimPlaybackSession();

    // Waking has to be asked for inside the gesture that called us, before the
    // first await — which is why starting playback is a tap and never an
    // effect.
    const ctx = await this.wake();

    const mine = this.generation;
    await this.fetchFor(notes);
    if (mine !== this.generation) return;

    this.notes = notes;
    this.next = 0;
    this.startedAt = ctx.currentTime + LEAD_IN_SECONDS;
    this.playing = true;

    this.schedule();
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /**
   * Gets a context that is actually running, and says so if it cannot.
   *
   * A context does not only start suspended on iOS — it can also be taken away
   * again later. Safari parks it when the system claims the audio session: a
   * page holding a microphone, a call, the ring switch. The context then stays
   * put, its clock stops advancing, and everything scheduled against it is
   * silent while the app cheerfully believes it is playing. That is the worst
   * kind of failure, because it looks like working.
   *
   * So `resume` is awaited rather than fired off, and the state is checked
   * afterwards. One that will not come back is thrown away and built again —
   * the recordings go with it, since they belong to the context that decoded
   * them. If even a fresh one refuses, that is reported rather than swallowed.
   */
  private async wake(): Promise<AudioContext> {
    const ctx = this.context();
    if (await running(ctx)) return ctx;

    this.teardown();
    const fresh = this.context();
    if (await running(fresh)) return fresh;

    throw new Error(
      "Das Gerät gibt gerade keinen Ton frei. Das passiert, wenn eine andere " +
        "Seite oder App das Mikrofon hält, oder wenn der Stummschalter am iPad " +
        "aktiv ist.",
    );
  }

  stop(): void {
    this.generation++;

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playing = false;
    this.notes = [];
    this.next = 0;

    const ctx = this.ctx;
    if (!ctx) return;

    // Fade rather than cut: a recording stopped mid-waveform clicks.
    const now = ctx.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, SILENT), now);
      voice.gain.gain.setTargetAtTime(SILENT, now, 0.03);
      try {
        voice.source.stop(now + 0.2);
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
    this.teardown();
  }

  /** Gives the audio hardware back and forgets everything decoded against it. */
  private teardown(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.voices = [];
    this.buffers.clear();
    this.loading.clear();
  }

  /**
   * Fetches the recordings this passage calls for, and no others.
   *
   * A C major scale needs five of the thirty; a whole sonata movement perhaps
   * half. What has been fetched stays, so moving through a piece only ever
   * adds what is new.
   */
  private async fetchFor(notes: readonly ScheduledNote[]): Promise<void> {
    const wanted = new Set<number>();
    for (const note of notes) wanted.add(sampleFor(note.midi));
    await Promise.all([...wanted].map((index) => this.buffer(index)));
  }

  private buffer(index: number): Promise<AudioBuffer> {
    const ready = this.buffers.get(index);
    if (ready) return Promise.resolve(ready);

    const pending = this.loading.get(index);
    if (pending) return pending;

    const job = this.load(index).finally(() => this.loading.delete(index));
    this.loading.set(index, job);
    return job;
  }

  private async load(index: number): Promise<AudioBuffer> {
    const ctx = this.context();
    // BASE_URL is "/" in development and "/piano-trainer/" in the build.
    const url = `${import.meta.env.BASE_URL}piano/${SAMPLES[index]}.mp3`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${SAMPLES[index]}.mp3 liess sich nicht laden (${response.status}).`);
    }

    const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
    const buffer = condense(ctx, decoded);
    this.buffers.set(index, buffer);
    return buffer;
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
   * One struck note: the nearest recording, shifted by at most a semitone.
   *
   * What the recording does not know is when the key is let go, so the damper
   * is put back by hand — a fall to silence where the written length ends,
   * quicker up top than down in the bass, which is how the real ones behave.
   */
  private voice(note: ScheduledNote, at: number): void {
    const ctx = this.ctx;
    const master = this.master;
    const index = sampleFor(note.midi);
    const buffer = this.buffers.get(index);
    if (!ctx || !master || !buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (note.midi - midiOf(index)) / 12);

    const release = 0.22 * Math.pow(2, -(note.midi - 36) / 48);
    const end = at + note.duration;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(NOTE_LEVEL, at);
    gain.gain.setTargetAtTime(SILENT, end, release);

    source.connect(gain);
    gain.connect(master);

    const voice: Voice = { source, gain };
    this.voices.push(voice);

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices = this.voices.filter((v) => v !== voice);
    };

    source.start(at);
    source.stop(end + release * 6);
  }

  private context(): AudioContext {
    if (this.ctx) return this.ctx;

    // Has to be claimed before the context exists, or the context is built
    // against the session Safari had already chosen.
    claimPlaybackSession();
    const ctx = new AudioContext();

    const master = ctx.createGain();
    master.gain.value = MASTER_LEVEL;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMIT_DB;
    limiter.knee.value = 0;
    limiter.ratio.value = 12;

    master.connect(limiter);
    limiter.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    return ctx;
  }
}

/**
 * Tells the device that this page plays music, not incidental sound.
 *
 * Safari files a bare AudioContext under "ambient", and the ring switch
 * silences that category outright — which is right for a page that beeps and
 * wrong for one someone practises to. "playback" is the category a music
 * player belongs in, and it is not silenced.
 *
 * This was found the hard way. For a while the app played with the switch on,
 * and it looked like it simply worked; in fact a microphone test page was
 * holding a recording session, whose category also ignores the switch, and the
 * app was living off it. Releasing the microphone properly took that away and
 * the real default came back.
 *
 * Only Safari 16.4 and later, and not in the type definitions yet, hence the
 * narrow cast. Where it is missing the ring switch keeps the last word, which
 * is the behaviour we already had. When the microphone arrives this becomes
 * "play-and-record", because a page can only hold one category at a time.
 */
function claimPlaybackSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  if (session) session.type = "playback";
}

/** True when this browser can make a sound at all. */
export function isAudioSupported(): boolean {
  return typeof AudioContext !== "undefined";
}

/**
 * Asks a context to run and reports whether it did.
 *
 * `resume` rejects outright in some states and simply does nothing in others,
 * so the promise is not the answer — the state afterwards is.
 */
async function running(ctx: AudioContext): Promise<boolean> {
  try {
    await ctx.resume();
  } catch {
    // Some states refuse; the check below decides either way.
  }
  return ctx.state === "running";
}

/** The recording nearest a pitch, so nothing is shifted by more than a semitone. */
function sampleFor(midi: number): number {
  const step = Math.round((midi - LOWEST_MIDI) / SEMITONES_APART);
  return Math.min(Math.max(step, 0), SAMPLES.length - 1);
}

/** What the recording at that position actually sounds. */
function midiOf(index: number): number {
  return LOWEST_MIDI + index * SEMITONES_APART;
}

/**
 * Folds a recording down to one channel and cuts its tail.
 *
 * Both are about memory rather than sound — see MAX_SAMPLE_SECONDS. Stereo
 * width is no loss on a tablet speaker, and the part that is cut away is the
 * last whisper of a decay that the damper has long since ended.
 */
function condense(ctx: BaseAudioContext, source: AudioBuffer): AudioBuffer {
  const frames = Math.min(
    source.length,
    Math.ceil(MAX_SAMPLE_SECONDS * source.sampleRate),
  );
  const mono = ctx.createBuffer(1, frames, source.sampleRate);
  const out = mono.getChannelData(0);

  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const data = source.getChannelData(channel);
    for (let i = 0; i < frames; i++) out[i] += data[i] / source.numberOfChannels;
  }

  if (frames < source.length) {
    const fade = Math.min(frames, Math.round(FADE_SECONDS * source.sampleRate));
    for (let i = 0; i < fade; i++) out[frames - fade + i] *= 1 - i / fade;
  }

  return mono;
}
