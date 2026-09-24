/**
 * Notices the moment a note is struck.
 *
 * This is the half of microphone input that has to run all the time, so it has
 * to be cheap: it sees one number per frame, the loudness of that frame, and
 * says whether a key was just hit. Working out *which* note costs eight
 * milliseconds and runs only when this says yes.
 *
 * That split comes straight out of the bench in `pitch-lab.html`. A piano note
 * is recognised 28 times out of 30 in the first fifty milliseconds and only 15
 * times out of 30 three seconds later, because the fundamental dies before its
 * partials do. Asking at the strike is not a shortcut, it is the only moment
 * worth asking at — and it happens to be exactly what the engine wants, since
 * it asks whether a note was played, never what is still ringing.
 *
 * Two questions are asked of every frame, because one is not enough.
 *
 * *Did it get louder?* That is all a strike out of silence needs, and it gets
 * every one of them. But in legato the last note is still ringing when the
 * next is struck, and a new note no louder than the old one barely moves the
 * total: measured in `onset-lab.html`, a loudness rule alone heard 3 of 26
 * second notes at crotchets and none at quavers.
 *
 * *Did new frequencies appear?* A struck note brings partials that were not
 * there a moment ago, whatever is ringing underneath. Measured over the same
 * cases, the rise across the spectrum is at least 2.35 at every legato strike
 * down to 150 ms apart, and below 1.0 everywhere else except the slow attack
 * of the very lowest notes. Quiet strikes out of silence are its weak corner —
 * which is exactly where the loudness rule is strong.
 */

/** Which of the two questions a strike was noticed by. */
export type Strike = "loudness" | "spectrum";

export interface OnsetOptions {
  /**
   * How much louder than what came before counts as a strike.
   *
   * A ratio rather than a difference, because a piano covers an enormous range
   * of loudness and a fixed step would either miss quiet playing or fire
   * constantly during loud playing.
   */
  rise?: number;
  /**
   * The shortest gap between two strikes, in seconds.
   *
   * A hammer stroke is not one clean step: the attack rings, wobbles and can
   * cross the threshold several times within a few dozen milliseconds. Without
   * a gap one key press arrives as three. Set from the fastest thing anyone
   * actually plays — semiquavers at 160 are one note every 94 ms.
   */
  gap?: number;
  /** Below this loudness nothing is a note, however sharp the rise. */
  floor?: number;
  /**
   * How quickly the running background level follows the signal, as the share
   * of the gap it takes to catch up.
   *
   * Slow enough that the decay of the last note does not become the new normal
   * before the next one, quick enough to follow a change of dynamic.
   */
  settle?: number;
  /**
   * How far the spectrum has to rise, in decibels averaged over its bins, to
   * count as new partials — see `spectralFlux`.
   *
   * Legato strikes measured 2.35 and up, everything that was not a strike
   * below 1.0 apart from the tails of the lowest notes, which reach 1.72. Two
   * sits between them with room on both sides.
   */
  flux?: number;
}

const DEFAULTS: Required<OnsetOptions> = {
  rise: 2.2,
  gap: 0.07,
  floor: 0.004,
  settle: 0.25,
  flux: 2,
};

export class OnsetDetector {
  private readonly options: Required<OnsetOptions>;
  /** The level the signal has settled at, which a strike has to stand out from. */
  private background = 0;
  private lastOnset = Number.NEGATIVE_INFINITY;
  private lastFlux = 0;
  private started = false;

  constructor(options: OnsetOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Feeds one frame in and reports whether a note was struck at it, and how
   * that was noticed.
   *
   * `level` is the root mean square of the frame, `at` its time in seconds and
   * `flux` how much its spectrum rose against a moment before. All three come
   * from the caller, so that this stays free of any clock and any transform.
   */
  feed(level: number, at: number, flux = 0): Strike | null {
    if (!this.started) {
      // Nothing to stand out from yet: the first frame sets the scene rather
      // than counting as a strike.
      this.background = level;
      this.lastFlux = flux;
      this.started = true;
      return null;
    }

    const { floor, rise, gap, flux: fluxThreshold } = this.options;
    const audible = level >= floor && at - this.lastOnset >= gap;

    const louder = level > this.background * rise;
    /*
     * The spectrum counts when it *crosses* the threshold, not while it stays
     * above it. The rise goes on for as long as the new note is still filling
     * the window, and the lowest notes build up so slowly that the tail of one
     * strike is still high after the gap has passed. Crossing happens once.
     */
    const newPartials = flux >= fluxThreshold && this.lastFlux < fluxThreshold;

    this.follow(level, at);
    this.lastFlux = flux;

    if (!audible || !(louder || newPartials)) return null;

    this.lastOnset = at;
    /*
     * The background jumps straight to the new note rather than drifting up to
     * it. Otherwise the ringing of the note just struck keeps towering over a
     * background that is still catching up, and every frame of its attack
     * counts as another strike.
     */
    this.background = level;
    return louder ? "loudness" : "spectrum";
  }

  /** Forgets everything, as after the microphone has been off. */
  reset(): void {
    this.background = 0;
    this.lastOnset = Number.NEGATIVE_INFINITY;
    this.lastFlux = 0;
    this.started = false;
  }

  /**
   * Moves the background towards the frame.
   *
   * Upwards it follows slowly, so a swell does not hide the next strike.
   * Downwards it follows at the same rate, which is what lets a note die away
   * and the next quiet note still register.
   */
  private follow(level: number, at: number): void {
    void at;
    const share = Math.min(1, Math.max(0, this.options.settle));
    this.background += (level - this.background) * share;
  }
}

/**
 * How much a spectrum rose against an earlier one: the average, over the
 * bins, of every increase in decibels. Decreases count as nothing.
 *
 * Only rises, because a note dying away lowers everything and a note arriving
 * raises what it brings; adding the two would let the one cancel the other.
 * In decibels, because a partial that appears quietly next to a loud old note
 * is as much news as one that appears loudly.
 *
 * `floorDb` is where the scale stops. Below it every bin counts as equally
 * silent, which keeps the noise of an empty room — measured with room noise
 * at the loudest the silence floor lets through, around -92 dB a bin — from
 * flickering into a rise. `bins` limits the sum to where piano partials
 * matter; the caller works out how many bins that is at its sample rate.
 */
export function spectralFlux(
  current: Float32Array,
  earlier: Float32Array,
  bins = current.length,
  floorDb = -80,
): number {
  const top = Math.min(bins, current.length, earlier.length);
  if (top <= 1) return 0;

  let sum = 0;
  // Bin 0 is the constant offset, not a frequency, so it is left out.
  for (let k = 1; k < top; k++) {
    const rise = Math.max(floorDb, current[k]) - Math.max(floorDb, earlier[k]);
    if (rise > 0) sum += rise;
  }
  return sum / (top - 1);
}
