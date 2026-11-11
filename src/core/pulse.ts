import type { Meter, Score } from "./score";

/**
 * Where the beats fall: the count-in before a run in tempo, and the pulse
 * during it.
 *
 * Positions are in whole notes on the same axis as the steps' onsets, so the
 * shell turns beats into seconds with the very clock it times the notes by
 * (`timeline` in playback.ts), tempo changes included.
 */

/** How a bar is counted: how many beats, and how long each one is in whole notes. */
export interface Count {
  beats: number;
  beat: number;
}

/**
 * Simple meters count their written unit: 4/4 in four quarters, 3/4 in three,
 * 2/2 in two halves. Compound meters count dotted beats — 6/8 in two, 9/8 in
 * three, 12/8 in four, each a dotted quarter — because that is what a pianist
 * counts and what a conductor beats; six eighths counted one by one would make
 * the music lurch. 3/8 has no dotted beat to group into and is counted in
 * three. Without a time signature, four quarters.
 */
export function countOf(meter: Meter | undefined): Count {
  const beats = meter?.beats ?? 4;
  const beatType = meter?.beatType ?? 4;
  if (beats > 3 && beats % 3 === 0 && beatType >= 8) {
    return { beats: beats / 3, beat: 3 / beatType };
  }
  return { beats, beat: 1 / beatType };
}

/** A beat, and which of its bar it is: 1 is the downbeat. */
export interface Beat {
  at: number;
  number: number;
}

/** Positions closer than this are the same: onsets are sums of fractions. */
const EPS = 1e-6;

/** A bar as it is played: where it starts and ends along the route, and how it counts. */
interface Bar {
  firstStep: number;
  start: number;
  end: number;
  count: Count;
  /**
   * Where beat 1 is, or would be. A bar shorter than its meter — an upbeat, or
   * the last bar that completes one — is the end of a bar, not its beginning:
   * an upbeat of one quarter in 3/4 is beat three. So its downbeat lies
   * before it.
   */
  downbeat: number;
}

/**
 * The bars along the route. A new bar begins where the bar number changes, or
 * where the bar has run its full length — the same bar played twice in a row,
 * as a one-bar repeat does, is two bars.
 */
function bars(score: Score): Bar[] {
  const steps = score.steps;
  const result: Bar[] = [];

  let i = 0;
  while (i < steps.length) {
    const start = steps[i].onset;
    const count = countOf(steps[i].meter);
    const full = count.beats * count.beat;

    let j = i;
    while (
      j + 1 < steps.length &&
      steps[j + 1].measure === steps[i].measure &&
      steps[j + 1].onset < start + full - EPS
    ) {
      j++;
    }

    const end = j + 1 < steps.length ? steps[j + 1].onset : start + full;
    const downbeat = end - start >= full - EPS ? start : end - full;
    result.push({ firstStep: i, start, end, count, downbeat });
    i = j + 1;
  }
  return result;
}

/** Every beat of the piece, in order, numbered within its bar. */
export function beatGrid(score: Score): Beat[] {
  const beats: Beat[] = [];
  for (const bar of bars(score)) {
    for (let k = 0; k < bar.count.beats; k++) {
      const at = bar.downbeat + k * bar.count.beat;
      if (at >= bar.start - EPS && at < bar.end - EPS) beats.push({ at, number: k + 1 });
    }
  }
  return beats;
}

/**
 * The count-in before a run that starts at `fromStep`: one whole bar counted
 * from its downbeat, and then the beats of the entry's own bar that come
 * before the entry — "1 2 3 4 | 1 2" for an entry on beat three, "1 2 3 | 1 2"
 * before an upbeat on three in 3/4. That is how a pianist counts themselves
 * in. An entry on a downbeat gets exactly one bar.
 *
 * The beats lie on the grid of the music that follows, so a note that starts
 * between two beats enters between them, as written.
 */
export function countIn(score: Score, fromStep: number): Beat[] {
  const all = bars(score);
  const steps = score.steps;
  if (all.length === 0 || fromStep < 0 || fromStep >= steps.length) return [];

  // The bar the entry falls in: the last one starting at or before it.
  let bar = all[0];
  for (const b of all) if (b.firstStep <= fromStep) bar = b;

  const entry = steps[fromStep].onset;
  const { beats, beat } = bar.count;
  const first = bar.downbeat - beats * beat;

  const result: Beat[] = [];
  for (let k = 0; first + k * beat < entry - EPS; k++) {
    result.push({ at: first + k * beat, number: (k % beats) + 1 });
  }
  return result;
}
