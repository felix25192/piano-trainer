import { describe, expect, it } from "vitest";
import { Hearing, WINDOW, type Heard } from "./hearing";
import { midiToFrequency } from "./pitch";

const RATE = 44100;
const FRAME = 0.01;

interface Strike {
  midi: number;
  at: number;
  /** When the damper falls; the note then dies within 30 ms. Rings on without. */
  until?: number;
  /** Detune in cents, for readings that fall between two keys. */
  cents?: number;
}

/**
 * A rough struck string: six harmonics, a 5 ms attack, a slow decay. Nothing
 * like the recordings `onset-lab.html` uses, but enough to pin down what the
 * loop does with a note — and deterministic, so a failure can be repeated.
 */
function play(strikes: Strike[], seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * RATE));
  const weights = [1, 0.6, 0.4, 0.25, 0.15, 0.1];

  for (const s of strikes) {
    const hz = midiToFrequency(s.midi) * Math.pow(2, (s.cents ?? 0) / 1200);
    const from = Math.floor(s.at * RATE);
    for (let i = from; i < out.length; i++) {
      const t = (i - from) / RATE;
      let envelope = Math.min(1, t / 0.005) * Math.exp(-t / 0.8);
      if (s.until !== undefined && i / RATE > s.until) {
        const fade = (i / RATE - s.until) / 0.03;
        if (fade >= 1) break;
        envelope *= 1 - fade;
      }
      let value = 0;
      for (let n = 0; n < weights.length; n++) value += weights[n] * Math.sin(2 * Math.PI * hz * (n + 1) * t);
      out[i] += 0.1 * envelope * value;
    }
  }
  return out;
}

/** What an analyser hands over every 10 ms — the newest WINDOW samples — through the loop. */
function listen(signal: Float32Array, hearing = new Hearing(RATE)): Heard[] {
  const window = new Float32Array(WINDOW);
  const heard: Heard[] = [];
  for (let t = 0.0037; t < signal.length / RATE; t += FRAME) {
    const end = Math.floor(t * RATE);
    for (let i = 0; i < WINDOW; i++) {
      const j = end - WINDOW + i;
      window[i] = j >= 0 && j < signal.length ? signal[j] : 0;
    }
    const h = hearing.feed(window, t);
    if (h) heard.push(h);
  }
  return heard;
}

const named = (heard: Heard[]) => heard.map((h) => h.midi);

describe("a note out of silence", () => {
  it("is heard once, as the key that was struck", () => {
    const heard = listen(play([{ midi: 69, at: 0.3 }], 1.5));
    expect(named(heard)).toEqual([69]);
  });

  /*
   * The mistake this module exists to prevent. At the frame where the strike
   * is noticed, the window still holds 90 ms of what came before and a few
   * milliseconds of the note — asked then, the pitch detector named 3 of 30
   * recordings. The question has to wait until the note has the window.
   */
  it("is named only once the window holds the note, not at the strike", () => {
    const [h] = listen(play([{ midi: 69, at: 0.3 }], 1.5));
    expect(h.answeredAt - h.struckAt).toBeGreaterThanOrEqual(0.1);
    expect(h.struckAt).toBeGreaterThanOrEqual(0.3);
    expect(h.struckAt).toBeLessThan(0.32);
  });

  it("dies away as one strike, not as several", () => {
    const heard = listen(play([{ midi: 57, at: 0.2 }], 3));
    expect(heard).toHaveLength(1);
  });

  it("is not imagined in silence", () => {
    expect(listen(new Float32Array(RATE))).toEqual([]);
  });

  /*
   * Two periods of C1 are 1349 samples, more than the newest 2048 can compare
   * against themselves — YIN needs twice the period inside the window. The
   * whole window is asked instead.
   */
  it("reaches the lowest keys through the whole window", () => {
    expect(named(listen(play([{ midi: 24, at: 0.3 }], 1.5)))).toEqual([24]);
  });

  it("is refused when it lands between two keys", () => {
    const [h] = listen(play([{ midi: 69, cents: 45, at: 0.3 }], 1.5));
    expect(h.midi).toBeNull();
    expect(h.refused).toBe("between-keys");
  });
});

describe("one note after another", () => {
  /*
   * The case that needed the spectrum. The old note still rings, the new one
   * is no louder, so the level barely moves — but partials appear that were
   * not there, and those are what the strike is noticed by.
   */
  it("hears the second note of a legato pair, not the first again", () => {
    const heard = listen(
      play([{ midi: 60, at: 0.3, until: 0.63 }, { midi: 64, at: 0.6 }], 1.8),
    );
    expect(named(heard)).toEqual([60, 64]);
    expect(heard[1].by).toBe("spectrum");
  });

  it("hears a scale in finger legato, down as well as up", () => {
    const up = [60, 62, 64, 65, 67, 69, 71, 72];
    for (const run of [up, [...up].reverse()]) {
      const strikes = run.map((midi, i) => ({ midi, at: 0.3 + i * 0.25, until: 0.3 + (i + 1) * 0.25 + 0.03 }));
      expect(named(listen(play(strikes, 3)))).toEqual(run);
    }
  });

  it("hears the same key struck again", () => {
    const heard = listen(play([{ midi: 67, at: 0.3, until: 0.56 }, { midi: 67, at: 0.6 }], 1.8));
    expect(named(heard)).toEqual([67, 67]);
  });

  /*
   * Faster than the question's delay: the next strike arrives before the last
   * one was named. The window then still holds mostly the earlier note, so it
   * is named there and then, rather than waiting until the next one fills it.
   */
  it("names a note early when the next strike comes first", () => {
    const heard = listen(
      play([{ midi: 72, at: 0.3, until: 0.4 }, { midi: 76, at: 0.37 }], 1.5),
    );
    expect(named(heard)).toEqual([72, 76]);
    expect(heard[0].answeredAt).toBeLessThan(heard[0].struckAt + 0.1);
  });
});

describe("starting over", () => {
  it("forgets a question still waiting", () => {
    const hearing = new Hearing(RATE);
    const signal = play([{ midi: 69, at: 0.1 }], 0.16);
    expect(listen(signal, hearing)).toEqual([]);

    hearing.reset();
    expect(listen(new Float32Array(RATE / 2), hearing)).toEqual([]);
  });
});
