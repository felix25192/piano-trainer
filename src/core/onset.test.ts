import { describe, expect, it } from "vitest";
import { OnsetDetector, spectralFlux } from "./onset";

/**
 * Plays a sequence of frame levels through a detector at a fixed frame rate
 * and reports the times at which it said a note was struck.
 */
function strikes(levels: number[], fps = 60, detector = new OnsetDetector()): number[] {
  const at: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    if (detector.feed(levels[i], i / fps)) at.push(i / fps);
  }
  return at;
}

/** A struck note: a jump, then a decay. */
function note(peak: number, frames: number): number[] {
  return Array.from({ length: frames }, (_, i) => peak * Math.pow(0.93, i));
}

const silence = (frames: number) => new Array<number>(frames).fill(0.0005);

describe("hearing a strike", () => {
  it("says nothing to silence", () => {
    expect(strikes(silence(120))).toEqual([]);
  });

  it("hears one note as one strike, not as its whole attack", () => {
    const heard = strikes([...silence(10), ...note(0.2, 60)]);
    expect(heard).toHaveLength(1);
  });

  it("hears four notes in a row as four", () => {
    const levels = [
      ...silence(10),
      ...note(0.2, 30),
      ...note(0.2, 30),
      ...note(0.2, 30),
      ...note(0.2, 30),
    ];
    expect(strikes(levels)).toHaveLength(4);
  });

  /*
   * The point of the whole thing: a note that is merely still ringing is not a
   * new note. Without this the engine would be pushed forward through a piece
   * by a single held chord.
   */
  it("does not hear a note dying away as a new one", () => {
    const heard = strikes([...silence(10), ...note(0.35, 180)]);
    expect(heard).toHaveLength(1);
  });

  it("ignores a rise that stays below the floor", () => {
    // A hundredfold rise, but from nothing to almost nothing.
    expect(strikes([...silence(10), ...note(0.002, 40)])).toEqual([]);
  });

  it("does not mistake a slow swell for a strike", () => {
    const swell = Array.from({ length: 120 }, (_, i) => 0.01 + (i / 120) * 0.2);
    expect(strikes(swell)).toEqual([]);
  });
});

describe("notes close together", () => {
  it("refuses two strikes inside the gap", () => {
    const detector = new OnsetDetector({ gap: 0.1 });
    expect(detector.feed(0.001, 0)).toBeNull();
    expect(detector.feed(0.2, 0.05)).toBe("loudness");
    // 30 ms later: a real second strike, but too soon to be one.
    expect(detector.feed(0.4, 0.08)).toBeNull();
  });

  /*
   * With the frames in between, as a real loop delivers them. Skipping them
   * would ask the detector to compare a new strike against a background that
   * is still sitting on top of the previous note, which never happens once
   * something is actually feeding it sixty times a second.
   */
  it("allows them once the gap has passed", () => {
    const detector = new OnsetDetector({ gap: 0.05 });
    detector.feed(0.001, 0);
    expect(detector.feed(0.2, 0.05)).toBe("loudness");

    for (let i = 1; i <= 4; i++) {
      expect(detector.feed(0.2 * Math.pow(0.93, i), 0.05 + i / 100)).toBeNull();
    }

    expect(detector.feed(0.4, 0.1)).toBe("loudness");
  });

  /*
   * Semiquavers at 160 are a note every 94 ms, which is about as fast as
   * anything in the repertoire gets. The default gap has to sit below that or
   * fast passages lose notes.
   */
  it("keeps up with semiquavers at 160", () => {
    const perNote = 60 / 160 / 4;
    const detector = new OnsetDetector();
    const fps = 100;
    let heard = 0;

    for (let i = 0; i < 100; i++) {
      const t = i / fps;
      const since = t % perNote;
      // A fresh attack at each note, decaying in between.
      const level = 0.25 * Math.pow(0.0001, since / perNote);
      if (detector.feed(level, t)) heard++;
    }

    expect(heard).toBeGreaterThanOrEqual(6);
  });
});

/*
 * The case the loudness alone cannot see: the last note still ringing, the
 * next one no louder, and only the spectrum saying something new arrived.
 */
describe("new partials", () => {
  it("hears a strike the loudness misses, by the spectrum", () => {
    const detector = new OnsetDetector();
    detector.feed(0.001, 0);
    expect(detector.feed(0.2, 0.01)).toBe("loudness");

    // The old note rings on at much the same level; the new one barely adds.
    for (let i = 1; i < 30; i++) detector.feed(0.2, 0.01 + i / 100, 0.3);
    expect(detector.feed(0.22, 0.31, 3)).toBe("spectrum");
  });

  it("counts a rise once, however long it stays high", () => {
    const detector = new OnsetDetector();
    detector.feed(0.2, 0, 0);
    const fired = [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16].map((t) => detector.feed(0.2, t, 3));
    expect(fired.filter(Boolean)).toHaveLength(1);
  });

  /*
   * The lowest notes build up so slowly that their spectrum is still rising
   * after the gap. Measured: up to 1.72, 74 ms after their own strike. Only a
   * fresh crossing counts, so that tail cannot fire again even if it were
   * higher.
   */
  it("does not hear the slow tail of a low note as a second strike", () => {
    const detector = new OnsetDetector();
    detector.feed(0.001, 0, 0);
    expect(detector.feed(0.1, 0.01, 4)).toBe("loudness");
    const tail = [3.5, 3, 2.6, 2.3, 2.2, 2.1, 2.05].map((flux, i) =>
      detector.feed(0.1, 0.02 + i / 100, flux),
    );
    expect(tail.filter(Boolean)).toEqual([]);
  });

  it("does not take a rise in the spectrum for a note below the floor", () => {
    const detector = new OnsetDetector();
    detector.feed(0.001, 0, 0);
    expect(detector.feed(0.002, 0.01, 5)).toBeNull();
  });
});

describe("the rise across the spectrum", () => {
  const flat = (db: number, bins = 64) => new Float32Array(bins).fill(db);

  it("is zero for a spectrum that did not change", () => {
    expect(spectralFlux(flat(-40), flat(-40))).toBe(0);
  });

  it("does not count a note dying away", () => {
    expect(spectralFlux(flat(-50), flat(-40))).toBe(0);
  });

  it("counts new partials against a spectrum that is otherwise falling", () => {
    const earlier = flat(-40);
    const now = flat(-43);
    // Four bins in sixty-three gain 30 dB, the rest lose 3.
    for (const k of [10, 20, 30, 40]) now[k] = -10;
    expect(spectralFlux(now, earlier)).toBeCloseTo((4 * 30) / 63, 5);
  });

  it("ignores what happens below the floor, where only room noise lives", () => {
    const earlier = flat(-120);
    const now = flat(-95);
    expect(spectralFlux(now, earlier)).toBe(0);
  });

  it("leaves out the constant offset in bin zero", () => {
    const earlier = flat(-60);
    const now = flat(-60);
    now[0] = 0;
    expect(spectralFlux(now, earlier)).toBe(0);
  });
});

describe("starting over", () => {
  it("does not call the very first frame a strike", () => {
    const detector = new OnsetDetector();
    expect(detector.feed(0.5, 0)).toBeNull();
  });

  it("forgets what it heard when reset", () => {
    const detector = new OnsetDetector();
    strikes([...silence(10), ...note(0.2, 30)], 60, detector);

    detector.reset();
    expect(detector.feed(0.5, 99)).toBeNull();
  });
});
