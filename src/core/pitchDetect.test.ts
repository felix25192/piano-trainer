import { describe, expect, it } from "vitest";
import { detectPitch } from "./pitchDetect";
import { frequencyToMidi, midiToFrequency, nameToMidi } from "./pitch";

const RATE = 44100;

/** A plain sine, the easiest thing a detector can be asked about. */
function sine(hz: number, seconds = 0.2, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE);
  }
  return samples;
}

/**
 * A stack of harmonics on one fundamental, which is roughly what a string
 * does. `weights[0]` is the fundamental, `weights[1]` the octave above it, and
 * so on — a weight of zero leaves that partial out.
 */
function harmonics(hz: number, weights: number[], seconds = 0.2): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    let value = 0;
    for (let n = 0; n < weights.length; n++) {
      value += weights[n] * Math.sin((2 * Math.PI * hz * (n + 1) * i) / RATE);
    }
    samples[i] = value * 0.3;
  }
  return samples;
}

function noise(seconds = 0.2, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE));
  // A fixed sequence rather than Math.random, so a failure can be repeated.
  let seed = 12345;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    samples[i] = ((seed / 0x7fffffff) * 2 - 1) * amplitude;
  }
  return samples;
}

/** What note the detector heard, by name, or null. */
function heard(samples: Float32Array): string | null {
  const found = detectPitch(samples, RATE);
  if (!found) return null;
  const { midi } = frequencyToMidi(found.hz);
  return `${midi}`;
}

describe("plain tones", () => {
  it("finds the A that everything is tuned to", () => {
    const found = detectPitch(sine(440), RATE);

    expect(found).not.toBeNull();
    expect(found!.hz).toBeCloseTo(440, 0);
    expect(found!.clarity).toBeGreaterThan(0.9);
  });

  it("gets every A on the keyboard right", () => {
    // A1 to A6. A0 needs a longer window and has a test of its own.
    for (const name of ["A1", "A2", "A3", "A4", "A5", "A6"]) {
      const midi = nameToMidi(name);
      const found = detectPitch(sine(midiToFrequency(midi)), RATE);

      expect(found, name).not.toBeNull();
      expect(frequencyToMidi(found!.hz).midi, name).toBe(midi);
    }
  });

  it("reports how far out of tune it was", () => {
    // Thirty cents sharp of A4 — a wrong note is a semitone, so this is the
    // scale on which "close but not it" has to be distinguishable.
    const found = detectPitch(sine(440 * Math.pow(2, 30 / 1200)), RATE);
    const { midi, cents } = frequencyToMidi(found!.hz);

    expect(midi).toBe(69);
    expect(cents).toBeGreaterThan(25);
    expect(cents).toBeLessThan(35);
  });
});

describe("what a string actually sounds like", () => {
  it("hears the fundamental, not the loudest partial", () => {
    /*
     * A low piano string can put more energy into its second partial than into
     * the note that was played. Picking the strongest peak out of a spectrum
     * would answer an octave too high; the period is unchanged.
     */
    const samples = harmonics(midiToFrequency(nameToMidi("A2")), [0.3, 1, 0.6, 0.4, 0.2]);

    expect(heard(samples)).toBe(String(nameToMidi("A2")));
  });

  it("hears a note whose fundamental is not there at all", () => {
    // Only the 2nd, 3rd and 4th partials. The ear still hears the missing
    // fundamental, and so must this — it is the reason for using YIN rather
    // than reading a spectrum.
    const samples = harmonics(midiToFrequency(nameToMidi("C3")), [0, 1, 0.7, 0.5]);

    expect(heard(samples)).toBe(String(nameToMidi("C3")));
  });

  it("is not fooled by a quiet note", () => {
    const samples = harmonics(midiToFrequency(nameToMidi("E4")), [1, 0.5, 0.3], 0.2);
    for (let i = 0; i < samples.length; i++) samples[i] *= 0.02;

    expect(heard(samples)).toBe(String(nameToMidi("E4")));
  });
});

describe("knowing when to say nothing", () => {
  it("says nothing to silence", () => {
    expect(detectPitch(new Float32Array(8192), RATE)).toBeNull();
  });

  it("says nothing, or says it unsurely, to noise", () => {
    const found = detectPitch(noise(), RATE);
    if (found !== null) expect(found.clarity).toBeLessThan(0.5);
  });

  /*
   * The lowest key on the piano has a period of 1600 samples at 44.1 kHz, and
   * two of them have to fit in the window. A short window must refuse rather
   * than guess: an octave error here would be silently wrong.
   */
  it("refuses A0 in a window too short to hold it", () => {
    const tooShort = sine(midiToFrequency(21), 2048 / RATE);
    expect(detectPitch(tooShort, RATE)).toBeNull();
  });

  it("finds A0 once the window is long enough", () => {
    const found = detectPitch(sine(midiToFrequency(21), 0.2), RATE);

    expect(found).not.toBeNull();
    expect(frequencyToMidi(found!.hz).midi).toBe(21);
  });
});
