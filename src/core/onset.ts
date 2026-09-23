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
 */

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
}

const DEFAULTS: Required<OnsetOptions> = {
  rise: 2.2,
  gap: 0.07,
  floor: 0.004,
  settle: 0.25,
};

export class OnsetDetector {
  private readonly options: Required<OnsetOptions>;
  /** The level the signal has settled at, which a strike has to stand out from. */
  private background = 0;
  private lastOnset = Number.NEGATIVE_INFINITY;
  private started = false;

  constructor(options: OnsetOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Feeds one frame in and reports whether a note was struck at it.
   *
   * `level` is the root mean square of the frame and `at` is its time in
   * seconds; both come from the caller so that this stays free of any clock.
   */
  feed(level: number, at: number): boolean {
    if (!this.started) {
      // Nothing to stand out from yet: the first frame sets the scene rather
      // than counting as a strike.
      this.background = level;
      this.started = true;
      return false;
    }

    const struck =
      level >= this.options.floor &&
      level > this.background * this.options.rise &&
      at - this.lastOnset >= this.options.gap;

    this.follow(level, at);

    if (!struck) return false;

    this.lastOnset = at;
    /*
     * The background jumps straight to the new note rather than drifting up to
     * it. Otherwise the ringing of the note just struck keeps towering over a
     * background that is still catching up, and every frame of its attack
     * counts as another strike.
     */
    this.background = level;
    return true;
  }

  /** Forgets everything, as after the microphone has been off. */
  reset(): void {
    this.background = 0;
    this.lastOnset = Number.NEGATIVE_INFINITY;
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
