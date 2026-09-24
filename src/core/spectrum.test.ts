import { describe, expect, it } from "vitest";
import { spectrumDb } from "./spectrum";

const RATE = 44100;

function sine(hz: number, length: number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE);
  return samples;
}

function loudestBin(spectrum: Float32Array): number {
  let best = 0;
  for (let k = 1; k < spectrum.length; k++) if (spectrum[k] > spectrum[best]) best = k;
  return best;
}

describe("the spectrum of a window", () => {
  it("puts a tone in the bin of its frequency", () => {
    // Bin 100 of 2048 at 44.1 kHz sits at 2153 Hz.
    const hz = (100 * RATE) / 2048;
    expect(loudestBin(spectrumDb(sine(hz, 2048), 2048))).toBe(100);
  });

  it("has one value per bin up to half the sample rate", () => {
    expect(spectrumDb(sine(440, 2048), 2048)).toHaveLength(1024);
  });

  /*
   * The level the analyser would report, which is what makes the thresholds
   * in `core/onset.ts` mean the same in the bench as on the device. A sine of
   * amplitude A through a Blackman window peaks at A × 0.42 / 2 after dividing
   * by the length: 0.105 for A = 0.5, which is -19.6 dB.
   */
  it("reports a tone at the level an analyser would", () => {
    const hz = (100 * RATE) / 2048;
    const spectrum = spectrumDb(sine(hz, 2048), 2048);
    expect(spectrum[100]).toBeCloseTo(20 * Math.log10((0.5 * 0.42) / 2), 1);
  });

  it("takes the newest samples when handed more than it needs", () => {
    const hz = (100 * RATE) / 2048;
    const samples = new Float32Array(4096);
    samples.set(sine(hz, 2048), 2048);
    expect(loudestBin(spectrumDb(samples, 2048))).toBe(100);
  });

  it("reads silence as a very low number, not as minus infinity", () => {
    const spectrum = spectrumDb(new Float32Array(1024), 1024);
    expect(Number.isFinite(spectrum[10])).toBe(true);
    expect(spectrum[10]).toBeLessThan(-200);
  });

  it("refuses a length the transform cannot take", () => {
    expect(() => spectrumDb(new Float32Array(1000), 1000)).toThrow();
  });
});
