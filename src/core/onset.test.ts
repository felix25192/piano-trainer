import { describe, expect, it } from "vitest";
import { OnsetDetector } from "./onset";

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
    expect(detector.feed(0.001, 0)).toBe(false);
    expect(detector.feed(0.2, 0.05)).toBe(true);
    // 30 ms later: a real second strike, but too soon to be one.
    expect(detector.feed(0.4, 0.08)).toBe(false);
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
    expect(detector.feed(0.2, 0.05)).toBe(true);

    for (let i = 1; i <= 4; i++) {
      expect(detector.feed(0.2 * Math.pow(0.93, i), 0.05 + i / 100)).toBe(false);
    }

    expect(detector.feed(0.4, 0.1)).toBe(true);
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

describe("starting over", () => {
  it("does not call the very first frame a strike", () => {
    const detector = new OnsetDetector();
    expect(detector.feed(0.5, 0)).toBe(false);
  });

  it("forgets what it heard when reset", () => {
    const detector = new OnsetDetector();
    strikes([...silence(10), ...note(0.2, 30)], 60, detector);

    detector.reset();
    expect(detector.feed(0.5, 99)).toBe(false);
  });
});
