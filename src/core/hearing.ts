import { OnsetDetector, spectralFlux, type OnsetOptions, type Strike } from "./onset";
import { detectPitch, type DetectedPitch } from "./pitchDetect";
import { frequencyToMidi, isOnPiano } from "./pitch";
import { spectrumDb } from "./spectrum";

/**
 * What happens to each look at the microphone: a frame of samples in, a
 * struck note out — or nothing.
 *
 * This used to live inside `adapters/MicInput.ts`, and that is where it went
 * wrong. The bench measured the detector on windows that *began* at the
 * strike; the adapter asked it about the window that *ended* there, which is
 * nearly all silence or the note before. From silence it named 3 notes of 30
 * where the bench promised 28. Neither half was wrong on its own — the gap
 * between them was. So the loop is here now, pure, and `onset-lab.html`, the
 * tests and the app all run this one.
 *
 * Three things follow from the measurements, and they are the whole design:
 *
 * The strike is noticed by loudness *and* by the spectrum, over short windows
 * rather than the long one the pitch needs — see `core/onset.ts` for why one
 * rule is not enough.
 *
 * The pitch is asked for *after* the strike, once the window holds nothing but
 * the new note, and over the most recent 46 ms rather than all 93. In legato
 * the old note is still sounding for the first moments of the new one, and a
 * window with both in it is a chord: YIN then finds the period the two share,
 * which for a minor third is a G sharp three octaves down. With the damper
 * falling 30 ms after the next key goes down — ordinary finger legato — the
 * short window named 26 of 26 second notes, the long one 16.
 *
 * With the pedal down nothing helps, since the old note never stops: 12 of 26
 * at best, however the question is put. That is the chord problem, stage two,
 * and is left open rather than papered over.
 */

/**
 * How many samples the analyser has to deliver.
 *
 * 4096 samples are 93 ms at 44.1 kHz and reach down to about 22 Hz, below the
 * lowest key. Most questions use only the newest half — see `PITCH_SAMPLES`
 * — and the whole is there for the few keys the half cannot reach.
 */
export const WINDOW = 4096;

/**
 * The stretch the pitch is normally worked out over: the newest 46 ms.
 *
 * YIN needs two periods, so this reaches down to about 43 Hz — F1. The three
 * keys below that are asked about over the whole window instead, and only
 * believed when the answer is one this could not have given.
 */
const PITCH_SAMPLES = 2048;

/**
 * How long after the strike the pitch is asked for.
 *
 * Long enough for `PITCH_SAMPLES` to hold only the new note once the old one's
 * damper has fallen. Asked sooner, the start of the window still carries the
 * old note; asked later, the highlight lags the finger. With the damper
 * falling 80 ms late — sloppy legato — a question 60 ms after the strike named
 * 12 of 26 second notes; at this delay `onset-lab.html` counts 23. The answer
 * arrives about 110 ms after the key goes down.
 */
const ASK_AFTER = 0.1;

/**
 * How far back the next note may already have begun when its strike is
 * noticed, in seconds.
 *
 * The spectrum sees a strike only once the new partials have moved in from
 * the edge of its window, which takes up to `FLUX_LAG` frames. A question cut
 * short by the next strike is therefore asked about the samples before that,
 * so that it names the note it belongs to and not the mixture of both.
 */
const NOTICED_LATE = 0.03;

/**
 * The stretch the loudness is measured over: the most recent 12 ms.
 *
 * Short, because a long one smears the strike. Over the full window a new
 * note enters a tenth at a time while the old one still fills the rest, and
 * repeated notes 300 ms apart were heard 1 time in 14. Over 512 samples, 13.
 */
const LEVEL_SAMPLES = 512;

/**
 * The stretch the spectrum is taken over.
 *
 * 2048 samples resolve 21.5 Hz, enough to tell a new partial from the old
 * note's neighbours. 1024 was measured as well and separates legato strikes
 * from the rest barely at all.
 */
const SPECTRUM_SAMPLES = 2048;

/**
 * How many frames back the spectrum is compared against.
 *
 * Neighbouring frames overlap by most of their length, so a rise shows only
 * a little between them. Three frames — 30 ms — is far enough apart for the
 * new note to stand out and near enough that the old one has hardly decayed.
 */
const FLUX_LAG = 3;

/** Only the part of the spectrum where piano partials matter is summed. */
const PARTIALS_HZ = 5000;

/**
 * How sure the detector has to be before a note is passed on.
 *
 * Clarity is what YIN reports about how cleanly the window repeated itself. A
 * held note on the device measured between 0.94 and 1.00; a chord, a cough or
 * a chair scraping sits far below.
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

/** Why a strike was heard but no note passed on. */
export type Refusal = "no-pitch" | "unclear" | "between-keys" | "off-keyboard";

/** One strike, and what came of it. */
export interface Heard {
  /** When the strike was noticed, in the caller's seconds. */
  struckAt: number;
  /** When the pitch was asked for — `ASK_AFTER` later, or sooner if the next strike came first. */
  answeredAt: number;
  /** Which question noticed it. */
  by: Strike;
  /** Loudness at the strike, root mean square over the short window. */
  level: number;
  /** Spectral rise at the strike, in the units of `spectralFlux`. */
  flux: number;
  /** The key that was heard, or null when the answer was refused. */
  midi: number | null;
  clarity: number | null;
  cents: number | null;
  refused: Refusal | null;
}

interface Pending {
  struckAt: number;
  askAt: number;
  by: Strike;
  level: number;
  flux: number;
}

export class Hearing {
  private readonly sampleRate: number;
  private readonly onsets: OnsetDetector;
  private readonly bins: number;
  /** The last few spectra, oldest first, to compare the newest against. */
  private spectra: Float32Array[] = [];
  private pending: Pending | null = null;

  constructor(sampleRate: number, options: OnsetOptions = {}) {
    this.sampleRate = sampleRate;
    this.onsets = new OnsetDetector(options);
    this.bins = Math.floor(PARTIALS_HZ / (sampleRate / SPECTRUM_SAMPLES));
  }

  /**
   * One look at the microphone.
   *
   * `samples` are the most recent ones, newest last — what an analyser hands
   * over — and `at` is when, in seconds. Returns the strike whose question
   * fell due at this frame, if one did.
   */
  feed(samples: Float32Array, at: number): Heard | null {
    const level = rms(samples, LEVEL_SAMPLES);

    const spectrum = spectrumDb(samples, SPECTRUM_SAMPLES);
    const earlier = this.spectra.length >= FLUX_LAG ? this.spectra[0] : null;
    const flux = earlier ? spectralFlux(spectrum, earlier, this.bins) : 0;
    this.spectra.push(spectrum);
    if (this.spectra.length > FLUX_LAG) this.spectra.shift();

    const strike = this.onsets.feed(level, at, flux);

    /*
     * A question falls due once the new note has the window to itself — or
     * earlier, when the next strike arrives first. At that moment the window
     * still holds mostly the note that is being asked about, and waiting any
     * longer would fill it with the next one.
     */
    let answer: Heard | null = null;
    if (this.pending && (strike || at >= this.pending.askAt)) {
      const usable = strike
        ? samples.subarray(0, Math.max(0, samples.length - Math.round(NOTICED_LATE * this.sampleRate)))
        : samples;
      answer = this.answer(this.pending, usable, at);
      this.pending = null;
    }

    if (strike) {
      this.pending = { struckAt: at, askAt: at + ASK_AFTER, by: strike, level, flux };
    }

    return answer;
  }

  /** Forgets everything, as after the microphone has been off. */
  reset(): void {
    this.onsets.reset();
    this.spectra = [];
    this.pending = null;
  }

  private answer(pending: Pending, samples: Float32Array, at: number): Heard {
    const heard: Heard = {
      struckAt: pending.struckAt,
      answeredAt: at,
      by: pending.by,
      level: pending.level,
      flux: pending.flux,
      midi: null,
      clarity: null,
      cents: null,
      refused: null,
    };

    const found = this.pitchOf(samples);
    if (!found) return { ...heard, refused: "no-pitch" };

    heard.clarity = found.clarity;
    if (found.clarity < MIN_CLARITY) return { ...heard, refused: "unclear" };

    const { midi, cents } = frequencyToMidi(found.hz);
    heard.cents = cents;
    if (Math.abs(cents) > MAX_CENTS) return { ...heard, refused: "between-keys" };
    if (!isOnPiano(midi)) return { ...heard, refused: "off-keyboard" };

    return { ...heard, midi };
  }

  /**
   * The pitch over the newest part of the window, or over all of it for the
   * lowest keys.
   *
   * The long window is searched across the whole range like the short one,
   * and its answer is only taken when it lies below what the short one can
   * reach. Searching it only down there would be the narrowing the pitch bench
   * showed to be wrong: a note an octave and a fifth higher repeats inside that
   * band too, and would be named as the low one.
   */
  private pitchOf(samples: Float32Array): DetectedPitch | null {
    const short = samples.length > PITCH_SAMPLES ? samples.subarray(samples.length - PITCH_SAMPLES) : samples;
    const found = detectPitch(short, this.sampleRate);
    if (found && found.clarity >= MIN_CLARITY) return found;
    if (short === samples) return found;

    const reach = this.sampleRate / (PITCH_SAMPLES / 2 - 1);
    const low = detectPitch(samples, this.sampleRate);
    return low && low.hz < reach ? low : found;
  }
}

/** Root mean square of the last `length` samples. */
function rms(samples: Float32Array, length: number): number {
  const from = Math.max(0, samples.length - length);
  let sum = 0;
  for (let i = from; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length - from));
}
