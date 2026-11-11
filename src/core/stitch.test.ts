import { describe, expect, it } from "vitest";
import { Stitcher } from "./stitch";
import { encodeWav } from "./wav";

const RATE = 48000;
const WINDOW = 4096;

/** Noise, as a microphone delivers it: never the same sample twice in a row. */
function noise(length: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 16807) % 2147483647;
    out[i] = (x / 2147483647) * 2 - 1;
  }
  return out;
}

/**
 * Plays a signal into a stitcher the way the microphone loop reads it: the
 * newest `WINDOW` samples, after each hop, with the time of the read.
 */
function play(signal: Float32Array, hops: number[], jitter = 0) {
  const stitcher = new Stitcher(RATE);
  let end = WINDOW;
  stitcher.feed(signal.slice(0, WINDOW), end / RATE);
  for (const [i, hop] of hops.entries()) {
    end += hop;
    // The clock that says when a look happened is never exact.
    const at = end / RATE + (i % 2 ? jitter : -jitter);
    stitcher.feed(signal.slice(end - WINDOW, end), at);
  }
  return { stitcher, end };
}

describe("putting the windows back together", () => {
  it("gets back exactly what was recorded, at an even pace", () => {
    const signal = noise(WINDOW + 100 * 480);
    const { stitcher, end } = play(signal, Array(100).fill(480));
    expect(stitcher.samples()).toEqual(signal.slice(0, end));
    expect(stitcher.gaps).toEqual([]);
  });

  it("does so at an uneven pace, and when the clock is off by a few milliseconds", () => {
    const hops = [480, 0, 128, 1200, 3000, 17, 480, 4000 - 256, 480];
    const signal = noise(WINDOW + hops.reduce((a, b) => a + b, 0));
    const { stitcher, end } = play(signal, hops, 0.004);
    expect(stitcher.samples()).toEqual(signal.slice(0, end));
  });

  it("finds its place in silence by the clock, where every seam looks alike", () => {
    const signal = new Float32Array(WINDOW + 20 * 480);
    signal.set(noise(2000), signal.length - 2000);
    const { stitcher, end } = play(signal, Array(20).fill(480));
    expect(stitcher.length).toBe(end);
    expect(stitcher.samples()).toEqual(signal.slice(0, end));
  });

  it("fills a stretch it never saw with silence, keeping the time line, and says so", () => {
    // One look came 5000 samples late: more than a window, so 904 are lost.
    const signal = noise(WINDOW + 480 + 5000 + 480);
    const { stitcher, end } = play(signal, [480, 5000, 480]);
    expect(stitcher.length).toBe(end);
    expect(stitcher.gaps).toEqual([{ at: WINDOW + 480, samples: 5000 - WINDOW }]);
    // Everything after the gap is exact again.
    expect(stitcher.samples().slice(end - 1000)).toEqual(signal.slice(end - 1000, end));
  });

  it("keeps about one anchor a second, to line other records up with the sound", () => {
    const signal = noise(WINDOW + 300 * 480);
    const { stitcher } = play(signal, Array(300).fill(480));
    // 3 s of hops: the first look and one a second after it.
    expect(stitcher.anchors.length).toBe(3);
    const [samples, at] = stitcher.anchors[1];
    expect(samples / RATE).toBeCloseTo(at, 2);
  });
});

describe("writing a WAV file", () => {
  it("writes a header a player understands", () => {
    const wav = new DataView(encodeWav(new Float32Array(10), 44100));
    const text = (at: number) => String.fromCharCode(...new Uint8Array(wav.buffer, at, 4));
    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    expect(wav.getUint16(20, true)).toBe(1); // PCM
    expect(wav.getUint16(22, true)).toBe(1); // mono
    expect(wav.getUint32(24, true)).toBe(44100);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.getUint32(40, true)).toBe(20);
    expect(wav.byteLength).toBe(44 + 20);
  });

  it("turns full scale into the largest sample, clips beyond it, and silences nonsense", () => {
    const wav = new DataView(encodeWav(new Float32Array([1, -1, 0.5, 2, Number.NaN]), RATE));
    const at = (i: number) => wav.getInt16(44 + 2 * i, true);
    expect([at(0), at(1), at(2), at(3), at(4)]).toEqual([32767, -32767, 16384, 32767, 0]);
  });
});
