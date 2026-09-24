/**
 * The loudness of each frequency in a window of samples, in decibels.
 *
 * The same numbers a Web Audio `AnalyserNode` reports with its smoothing
 * switched off: a Blackman window, a Fourier transform, the magnitude divided
 * by the window length, then decibels. Worked out here rather than asked of
 * the browser so that the bench, the tests and the app all run the same
 * arithmetic — the microphone path went wrong once already because the bench
 * measured one thing and the app ran another around it.
 *
 * It is cheap next to the pitch detector. A transform of 2048 samples is some
 * ten thousand multiplications; YIN over 4096 is several million. That is what
 * lets it run on every frame while the pitch is only asked for on a strike.
 */

/** Blackman windows by length, since the same one is asked for every frame. */
const windows = new Map<number, Float64Array>();

function blackman(length: number): Float64Array {
  let w = windows.get(length);
  if (w) return w;

  // The coefficients the Web Audio specification uses for its analyser.
  const alpha = 0.16;
  const a0 = (1 - alpha) / 2;
  const a1 = 0.5;
  const a2 = alpha / 2;

  w = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const x = (2 * Math.PI * i) / length;
    w[i] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x);
  }
  windows.set(length, w);
  return w;
}

/**
 * The spectrum of the last `length` samples, one value per frequency bin.
 *
 * Bin k sits at k × sampleRate / length Hz; there are length / 2 of them.
 * `length` has to be a power of two, which is what the transform below needs.
 */
export function spectrumDb(samples: Float32Array, length: number): Float32Array {
  if (length < 2 || (length & (length - 1)) !== 0) {
    throw new Error(`Spectrum length must be a power of two, got ${length}.`);
  }

  const w = blackman(length);
  const re = new Float64Array(length);
  const im = new Float64Array(length);

  // The most recent `length` samples; missing ones, before the start, are silence.
  const offset = samples.length - length;
  for (let i = 0; i < length; i++) {
    const j = offset + i;
    re[i] = j >= 0 ? samples[j] * w[i] : 0;
  }

  fft(re, im);

  const out = new Float32Array(length / 2);
  for (let k = 0; k < out.length; k++) {
    const magnitude = Math.hypot(re[k], im[k]) / length;
    // A floor far below anything audible, so silence is a number and not -Infinity.
    out[k] = 20 * Math.log10(magnitude + 1e-12);
  }
  return out;
}

/**
 * Radix-2 Cooley–Tukey, in place.
 *
 * The textbook one: reorder by reversed bit index, then combine pairs, then
 * pairs of pairs. Nothing clever, because nothing clever is needed at this
 * size.
 */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    const half = size / 2;

    for (let start = 0; start < n; start += size) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const tRe = re[b] * wRe - im[b] * wIm;
        const tIm = re[b] * wIm + im[b] * wRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const next = wRe * stepRe - wIm * stepIm;
        wIm = wRe * stepIm + wIm * stepRe;
        wRe = next;
      }
    }
  }
}
