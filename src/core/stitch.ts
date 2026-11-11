/**
 * Puts a continuous recording back together from the windows an analyser
 * hands out.
 *
 * The microphone loop looks at the newest 4096 samples every 10 ms, so
 * consecutive windows overlap by most of their length. Recording exactly what
 * the loop saw therefore needs no second tap on the audio graph — which on iOS
 * would be a new way to disturb the one audio session — only the arithmetic
 * of finding where each window continues the last.
 *
 * That arithmetic is exact, not estimated: a window is a copy of the same
 * samples, so the end of what has been recorded appears in the next window
 * bit for bit. Where it appears more than once — digital silence, which
 * repeats — the position the clock predicts decides.
 */

/** How many samples of the recording's end are looked for in the next window. */
const SEAM = 256;

/** A stretch the recording does not have, filled with silence to keep the time line. */
export interface Gap {
  /** Sample index where the silence begins. */
  at: number;
  samples: number;
}

export class Stitcher {
  readonly sampleRate: number;
  private chunks: Float32Array[] = [];
  private total = 0;
  private tail = new Float32Array(0);
  private lastAt: number | null = null;
  private readonly gapList: Gap[] = [];
  /** Sample counts against the caller's seconds, about one a second, to line up other records. */
  private readonly anchorList: Array<[number, number]> = [];

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Takes the next window, the newest samples last, and the time it was read
   * in the caller's seconds. Returns how many samples it added.
   */
  feed(window: Float32Array, at: number): number {
    if (this.lastAt === null) {
      this.append(window);
      this.mark(at);
      return window.length;
    }

    const expectedNew = Math.max(0, Math.round((at - this.lastAt) * this.sampleRate));
    const seam = this.tail;
    const found = findSeam(window, seam, window.length - seam.length - expectedNew);

    let added: number;
    if (found !== null) {
      added = window.length - (found + seam.length);
      if (added > 0) this.append(window.subarray(found + seam.length));
    } else {
      // The end of the recording is no longer in the window: more time went by
      // between two looks than one window covers. What lies between is lost.
      const missing = Math.max(0, expectedNew - window.length);
      this.gapList.push({ at: this.total, samples: missing });
      if (missing > 0) this.append(new Float32Array(missing));
      this.append(window);
      added = missing + window.length;
    }

    this.mark(at);
    return added;
  }

  get length(): number {
    return this.total;
  }

  get gaps(): readonly Gap[] {
    return this.gapList;
  }

  get anchors(): ReadonlyArray<[number, number]> {
    return this.anchorList;
  }

  /** The whole recording as one buffer. */
  samples(): Float32Array {
    const all = new Float32Array(this.total);
    let offset = 0;
    for (const chunk of this.chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    return all;
  }

  private append(samples: Float32Array): void {
    this.chunks.push(samples.slice());
    this.total += samples.length;

    const keep = Math.min(SEAM, this.total);
    const tail = new Float32Array(keep);
    // The newest samples may span the last few chunks when the new ones are few.
    let need = keep;
    for (let c = this.chunks.length - 1; c >= 0 && need > 0; c--) {
      const chunk = this.chunks[c];
      const take = Math.min(need, chunk.length);
      tail.set(chunk.subarray(chunk.length - take), need - take);
      need -= take;
    }
    this.tail = tail;
  }

  private mark(at: number): void {
    this.lastAt = at;
    const last = this.anchorList[this.anchorList.length - 1];
    if (!last || at - last[1] >= 1) this.anchorList.push([this.total, at]);
  }
}

/**
 * Where `seam` occurs in `window`, searching outwards from `expected`, or null.
 * Exact comparison on purpose: the samples are copies, not measurements.
 */
function findSeam(window: Float32Array, seam: Float32Array, expected: number): number | null {
  const last = window.length - seam.length;
  if (last < 0 || seam.length === 0) return null;

  const start = Math.min(Math.max(expected, 0), last);
  for (let d = 0; start - d >= 0 || start + d <= last; d++) {
    if (start + d <= last && matches(window, seam, start + d)) return start + d;
    if (d > 0 && start - d >= 0 && matches(window, seam, start - d)) return start - d;
  }
  return null;
}

function matches(window: Float32Array, seam: Float32Array, at: number): boolean {
  for (let i = 0; i < seam.length; i++) {
    if (window[at + i] !== seam[i]) return false;
  }
  return true;
}
