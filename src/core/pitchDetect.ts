/**
 * Finds the pitch of a single sounding note in a window of samples.
 *
 * Pure arithmetic over a Float32Array — no Web Audio, no microphone, no
 * browser. That is what lets it be tested against signals built in a test
 * file, and measured against recordings of a real piano, long before anyone
 * points a microphone at anything.
 *
 * The algorithm is YIN (de Cheveigné and Kawahara, 2002), which works in the
 * time domain rather than on a spectrum. That choice matters for a piano:
 *
 * A spectrum tempts you to pick the loudest peak, and on a piano string the
 * loudest peak is often *not* the fundamental — a low A can put more energy
 * into its second partial than into the note you actually played, and picking
 * peaks then reports the octave above. Worse, the fundamental can be missing
 * from the spectrum altogether and the ear still hears the note. YIN asks a
 * different question: at what shift does the wave most nearly repeat itself?
 * A missing fundamental changes the shape of one period; it does not change
 * how long the period is.
 *
 * It is monophonic. Handed a chord it will report something confidently wrong,
 * which is why the score model never asks it "what is playing" — see
 * "Verifikation statt Transkription" in docs/PLAN.md.
 */

export interface DetectedPitch {
  hz: number;
  /**
   * How cleanly the window repeated itself, from 0 to 1.
   *
   * Near 1 for a held note, low for noise, a chord, or the moment of the
   * hammer strike before the string settles. A caller that wants to be sure
   * should demand both a pitch and a clarity.
   */
  clarity: number;
}

export interface DetectOptions {
  /** Lowest pitch worth looking for. A0 is 27.5 Hz. */
  minHz?: number;
  /** Highest pitch worth looking for. C8 is 4186 Hz. */
  maxHz?: number;
  /**
   * How near to perfect repetition counts as found.
   *
   * YIN's own figure is 0.1. Lower is stricter and starts missing the decaying
   * tail of a piano note; higher starts calling noise a pitch.
   */
  threshold?: number;
  /** Below this root-mean-square level the window is treated as silence. */
  silence?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  minHz: 27.5,
  maxHz: 4186,
  threshold: 0.15,
  silence: 0.002,
};

export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: DetectOptions = {},
): DetectedPitch | null {
  const { minHz, maxHz, threshold, silence } = { ...DEFAULTS, ...options };

  if (rms(samples) < silence) return null;

  const shortest = Math.max(2, Math.floor(sampleRate / maxHz));
  /*
   * Two whole periods have to fit in the window, or there is nothing to
   * compare against: the difference is summed over `length - tau` samples, and
   * at tau beyond half the window that sum is too short to mean anything. At
   * 44.1 kHz an A0 has a period of 1600 samples, so finding one needs a window
   * of at least 3200. Ask for a low note with a small window and the answer is
   * null rather than a confident octave error.
   */
  const longest = Math.min(
    Math.floor(sampleRate / minHz),
    Math.floor(samples.length / 2) - 1,
  );
  if (longest <= shortest) return null;

  const normalised = cumulativeMeanNormalisedDifference(samples, longest);
  const tau = firstDipBelow(normalised, shortest, longest, threshold);
  if (tau === null) return null;

  const refined = interpolate(normalised, tau);
  if (!(refined > 0)) return null;

  const hz = sampleRate / refined;
  if (hz < minHz || hz > maxHz) return null;

  return { hz, clarity: clamp01(1 - normalised[tau]) };
}

/**
 * YIN's difference function, normalised so its values can be compared against
 * one fixed threshold whatever the signal's loudness.
 *
 * The raw difference d(tau) is the squared distance between the window and
 * itself shifted by tau, which is smallest where the wave repeats. On its own
 * it is useless as a test: it is also smallest at tau = 0, and it scales with
 * the volume. Dividing each value by the running mean of everything before it
 * fixes both — the result starts at 1, and a real period shows up as a dip
 * well below it.
 */
function cumulativeMeanNormalisedDifference(
  samples: Float32Array,
  longest: number,
): Float32Array {
  const out = new Float32Array(longest + 1);
  out[0] = 1;

  let runningSum = 0;

  for (let tau = 1; tau <= longest; tau++) {
    let difference = 0;
    const span = samples.length - tau;
    for (let i = 0; i < span; i++) {
      const delta = samples[i] - samples[i + tau];
      difference += delta * delta;
    }

    runningSum += difference;
    out[tau] = runningSum === 0 ? 1 : (difference * tau) / runningSum;
  }

  return out;
}

/**
 * The first shift that dips below the threshold, followed down to its lowest
 * point.
 *
 * Deliberately the *first* one and not the smallest: a wave that repeats every
 * period also repeats every two periods, every three, and so on, so the global
 * minimum is regularly an octave or two below the note that was played. Taking
 * the first dip is what keeps a low piano note from being reported an octave
 * down.
 */
function firstDipBelow(
  values: Float32Array,
  shortest: number,
  longest: number,
  threshold: number,
): number | null {
  for (let tau = shortest; tau <= longest; tau++) {
    if (values[tau] >= threshold) continue;

    // Walk to the bottom of this dip; the threshold is crossed on the way in.
    let best = tau;
    while (best + 1 <= longest && values[best + 1] < values[best]) best++;
    return best;
  }

  return null;
}

/**
 * Fits a parabola through the dip and its two neighbours.
 *
 * Without this the answer is a whole number of samples, and whole samples are
 * coarse: at 44.1 kHz the step from 100 to 101 samples is a jump of nearly 17
 * cents, which would put every reading audibly out of tune. The interpolated
 * minimum recovers the fraction between them.
 */
function interpolate(values: Float32Array, tau: number): number {
  const left = values[tau - 1];
  const here = values[tau];
  const right = values[tau + 1];

  if (left === undefined || right === undefined) return tau;

  const curvature = left + right - 2 * here;
  if (curvature <= 0) return tau;

  return tau + (left - right) / (2 * curvature);
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
