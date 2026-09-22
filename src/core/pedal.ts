/**
 * The damper pedal, as the score writes it.
 *
 * A score does not record "the pedal is down here"; it records the moments it
 * goes down and comes up. Turning those into spans is where the one real trap
 * lies, so it happens here, in reach of a test, rather than in the adapter
 * that reads them out of the file.
 *
 * Nothing in this file knows about OSMD, and nothing knows about sound. Times
 * are whole notes from the start of the piece, the same unit the score model
 * uses everywhere else.
 */

/** A moment at which the pedal goes down or comes up. */
export interface PedalMark {
  at: number;
  /** True for a pedal going down, false for one coming up. */
  down: boolean;
}

/** A stretch during which the dampers are off the strings. */
export interface PedalSpan {
  from: number;
  to: number;
}

/**
 * Pairs the marks into spans.
 *
 * The trap is the **pedal change**, where the foot comes up and goes straight
 * back down so the harmony clears without the line breaking. Both marks then
 * carry the *same* timestamp, and sorting by time alone can put the new down
 * before the old up — which pairs them into a span of no length and leaves the
 * real ones dangling. In the Chopin nocturne that alone accounts for 37 of the
 * 108 spans. So marks at the same instant are read as up first, then down.
 *
 * Anything that does not pair is dropped rather than guessed at: a second down
 * while one is already open changes nothing, an up with nothing open is
 * ignored, and a pedal still down at the end holds to the end of the piece.
 */
export function pedalSpans(marks: readonly PedalMark[]): PedalSpan[] {
  const ordered = [...marks].sort(
    (a, b) => a.at - b.at || Number(a.down) - Number(b.down),
  );

  const spans: PedalSpan[] = [];
  let open: number | null = null;

  for (const mark of ordered) {
    if (mark.down) {
      if (open === null) open = mark.at;
    } else if (open !== null) {
      if (mark.at > open) spans.push({ from: open, to: mark.at });
      open = null;
    }
  }

  if (open !== null) spans.push({ from: open, to: Number.POSITIVE_INFINITY });

  return spans;
}

/**
 * When the pedal that is down at `at` comes up again, or null when none is.
 *
 * At a pedal change the later span wins, which is what actually happens under
 * the foot: the note struck on the change is caught by the new pedal, while
 * everything before it is damped.
 */
export function pedalEndAt(spans: readonly PedalSpan[], at: number): number | null {
  let lo = 0;
  let hi = spans.length - 1;
  let found = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid].from <= at) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (found === -1) return null;
  return at < spans[found].to ? spans[found].to : null;
}
