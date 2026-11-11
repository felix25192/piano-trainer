import type { ScheduledStep } from "./playback";
import { demandedPitches, inHands, type Hands, type Score } from "./score";

/**
 * Judges a run in tempo: the highlight moves on by the clock, whatever is
 * played, and every step that asks for something gets a verdict afterwards.
 *
 * Nothing here waits for the player. That is the whole difference from the
 * matcher, which stands still until the right note comes — and the reason
 * this is a class of its own rather than a mode of that one. It knows no
 * clock either: times arrive as seconds since the first beat after the
 * count-in, from the caller, so a test can play a whole run in a few lines.
 *
 * The rules are written out in docs/PLAN.md, 11.11.2026, and numbered there;
 * the comments below refer to them.
 */

/** Hit: every note of the step, nothing foreign. Wrong: something foreign. Missed: neither. */
export type Verdict = "hit" | "wrong" | "missed";

/**
 * How long after a step's window closes it is judged (rule 5).
 *
 * The microphone answers a tenth of a second after the strike, and its answer
 * carries the time of the strike — so a note played in time can arrive after
 * its window has closed. It must still count.
 */
export const GRACE = 0.2;

/** The furthest a note may come before its step and still count for it (rule 2). */
const LEAD_MAX = 0.15;

/** ...and no more than this share of the gap since the step before. */
const LEAD_SHARE = 0.25;

interface Window {
  step: number;
  opens: number;
  closes: number;
  demanded: number[];
  /** Keys only the hand not being practised has here: let through, not judged. */
  otherHand: Set<number>;
  got: Set<number>;
  foreign: boolean;
  verdict: Verdict | null;
}

export class TempoRun {
  private readonly windows: Window[] = [];
  private readonly end: number;

  /**
   * @param timing when each step falls due, in seconds from the first beat —
   *   the `steps` of a schedule built for the run
   * @param end when the run is over: the end of the last note
   */
  constructor(score: Score, timing: ScheduledStep[], hands: Hands, end: number) {
    // Rule 1: only steps that ask for something get a window. The first asks
    // for a tie as well, the way a step put in place by hand does: nothing is
    // sounding there yet.
    const due: Array<{ step: number; at: number; demanded: number[]; otherHand: Set<number> }> = [];
    for (const { index, at } of timing) {
      const step = score.steps[index];
      const demanded = demandedPitches(step, hands, due.length === 0);
      if (demanded.length === 0) continue;
      const otherHand = new Set(
        step.notes.filter((n) => !inHands(n, hands) && !demanded.includes(n.midi)).map((n) => n.midi),
      );
      due.push({ step: index, at, demanded, otherHand });
    }

    // Rule 2: each window opens a little before its step, and closes where the
    // next one opens, so that every moment belongs to exactly one window.
    const opens = due.map((d, i) =>
      i === 0 ? d.at - LEAD_MAX : d.at - Math.min(LEAD_SHARE * (d.at - due[i - 1].at), LEAD_MAX),
    );
    due.forEach((d, i) => {
      this.windows.push({
        step: d.step,
        opens: opens[i],
        closes: i + 1 < due.length ? opens[i + 1] : Math.max(end, d.at),
        demanded: d.demanded,
        otherHand: d.otherHand,
        got: new Set(),
        foreign: false,
        verdict: null,
      });
    });

    this.end = Math.max(end, due.length ? due[due.length - 1].at : 0);
  }

  /**
   * A key struck at `at` seconds. Sorted into the window it falls in; a key
   * before the first window — during the count-in — or after the last counts
   * for nothing.
   */
  noteOn(midi: number, at: number): void {
    const window = this.windowAt(at);
    if (!window || window.verdict !== null) return;

    // Rule 3.
    if (window.demanded.includes(midi)) window.got.add(midi);
    else if (!window.otherHand.has(midi)) window.foreign = true;
  }

  /**
   * Judges every step whose window has closed and whose grace has run out by
   * `now`, and returns the ones newly judged, in order.
   */
  settle(now: number): Array<{ step: number; verdict: Verdict }> {
    const judged: Array<{ step: number; verdict: Verdict }> = [];
    for (const window of this.windows) {
      if (window.verdict !== null) continue;
      if (window.closes + GRACE > now) break;

      // Rule 4: anything foreign makes the step wrong, even beside the right
      // notes; all of them make it a hit; half a chord is missed.
      window.verdict = window.foreign
        ? "wrong"
        : window.demanded.every((m) => window.got.has(m))
          ? "hit"
          : "missed";
      judged.push({ step: window.step, verdict: window.verdict });
    }
    return judged;
  }

  /** Whether every step can be judged by `now`. */
  isOver(now: number): boolean {
    return now >= this.end + GRACE;
  }

  /** The verdicts so far, by step. */
  get verdicts(): Map<number, Verdict> {
    const result = new Map<number, Verdict>();
    for (const w of this.windows) if (w.verdict !== null) result.set(w.step, w.verdict);
    return result;
  }

  private windowAt(at: number): Window | null {
    const windows = this.windows;
    let lo = 0;
    let hi = windows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const w = windows[mid];
      if (at < w.opens) hi = mid - 1;
      else if (at >= w.closes) lo = mid + 1;
      else return w;
    }
    return null;
  }
}
