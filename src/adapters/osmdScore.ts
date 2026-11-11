import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { pedalEndAt, pedalSpans, type PedalMark } from "../core/pedal";
import { FALLBACK_BPM } from "../core/playback";
import type { ExpectedNote, Meter, Score, ScoreStep } from "../core/score";

/**
 * Everything the app does with OpenSheetMusicDisplay.
 *
 * Two halves. `ScoreView` draws: the engraving as one line, sized to the
 * screen, with the highlight on a given step. `extractScore` reads: it
 * translates what OSMD parsed into the engine's own score model, and records
 * where each step sits along the staff line.
 *
 * This is an adapter, and it is deliberately the only file in the project that
 * is allowed to know about OSMD's object graph. Keep it thin: it walks, it
 * copies, it measures, it makes no decisions. Everything worth testing lives
 * in src/core, which is why only the one pure function here has a test.
 */

/**
 * OSMD's cursor has no "length" to check against, so a runaway iterator would
 * hang the tab. No piano piece comes near this many note positions.
 */
const MAX_STEPS = 100_000;

export interface ReadScore {
  score: Score;
  /**
   * Where each step sits horizontally, as a fraction of the whole staff line
   * from 0 to 1 — not as pixels.
   *
   * Pixels would be wrong the moment the engraving is re-rendered at a
   * different zoom, and the app re-renders on every rotation. Proportions
   * survive that, because OSMD scales the whole layout uniformly. Turning one
   * back into a pixel position is a multiplication by the current width.
   */
  anchors: number[];
}

export function extractScore(
  osmd: OpenSheetMusicDisplay,
  title: string,
  /** The element OSMD renders into. Its own `container` is protected. */
  host: HTMLElement | null,
): ReadScore {
  const steps: ScoreStep[] = [];
  const anchors: number[] = [];
  const cursor = osmd.cursor;
  // Tempo is read per measure, not once for the sheet. Two reasons: a piece
  // can change tempo — the C major prelude drops from 72 to 30 for its last
  // two bars — and the sheet-wide default is not always filled in. The
  // Beethoven leaves it undefined while every one of its measures says 180.
  const measures = osmd.Sheet?.SourceMeasures ?? [];
  const pedals = pedalSpans(pedalMarks(osmd));
  const meters = metersOf(measures as unknown as MeasureTime[]);

  // Two layout reads for the whole walk; everything after this is arithmetic.
  const sheetWidth = host?.querySelector("svg")?.getBoundingClientRect().width ?? 0;
  const cursorWidth = cursorElement(cursor)?.offsetWidth ?? 0;

  cursor.reset();

  while (!isAtEnd(cursor) && steps.length < MAX_STEPS) {
    const measure = currentMeasure(cursor);
    const onset = currentOnset(cursor);
    /*
     * Pedal marks are timestamped in the printed score, the steps in the order
     * they are played, and a repeat pulls the two apart. So the question "is
     * the pedal down here" is asked in the score's own time, and only the
     * answer — how much longer the dampers stay off — is carried back over.
     */
    const source = currentSource(cursor);
    const lift = pedalEndAt(pedals, source);

    steps.push({
      index: steps.length,
      measure,
      notes: notesUnderCursor(cursor),
      onset,
      bpm: tempoOf(measures[measure - 1]),
      meter: meters[measure - 1],
      pedalUntil: lift === null ? null : onset + (lift - source),
    });
    anchors.push(sheetWidth > 0 ? cursorFraction(cursor, sheetWidth, cursorWidth) : 0);
    cursor.next();
  }

  // Leave the cursor where the caller found it — this function reads, it does
  // not consume.
  cursor.reset();

  if (steps.length >= MAX_STEPS) {
    throw new Error(
      `Score walk hit the ${MAX_STEPS} step ceiling; the cursor is probably not advancing.`,
    );
  }

  return { score: { title, steps }, anchors };
}

/** Finds the step nearest a point given as a fraction of the staff line. */
export function stepAtFraction(anchors: number[], fraction: number): number {
  if (anchors.length === 0) return 0;

  // Anchors are produced in order, so a binary search is safe.
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid] < fraction) lo = mid + 1;
    else hi = mid;
  }

  // `lo` is the first anchor at or past the point; the one before it may be
  // closer. A tap lands between two notes as often as on one.
  if (lo > 0 && Math.abs(anchors[lo - 1] - fraction) <= Math.abs(anchors[lo] - fraction)) {
    return lo - 1;
  }
  return lo;
}

type Cursor = OpenSheetMusicDisplay["cursor"];

function isAtEnd(cursor: Cursor): boolean {
  // `iterator` is public on the Cursor but not part of the published typings
  // in every release, hence the narrow cast rather than a blanket `any`.
  const iterator = (cursor as unknown as { iterator?: { EndReached?: boolean } }).iterator;
  return iterator?.EndReached ?? true;
}

function currentMeasure(cursor: Cursor): number {
  const iterator = (cursor as unknown as {
    iterator?: { CurrentMeasureIndex?: number };
  }).iterator;
  // OSMD counts measures from zero; printed scores count from one.
  return (iterator?.CurrentMeasureIndex ?? 0) + 1;
}

/**
 * How far into the piece the cursor stands, in whole notes.
 *
 * The *enrolled* timestamp, not the source one: it counts the route actually
 * taken, so a repeat carries it onward instead of sending it back to where the
 * repeated bars were first printed. That matters here because the walk itself
 * follows the same route — the Bach minuet is 32 bars on paper and 64 under
 * the hands — and a playback built on source timestamps would jump backwards
 * in the middle of a piece the player is moving forwards through.
 */
function currentOnset(cursor: Cursor): number {
  const iterator = (cursor as unknown as {
    iterator?: { CurrentEnrolledTimestamp?: { RealValue?: number } };
  }).iterator;
  return iterator?.CurrentEnrolledTimestamp?.RealValue ?? 0;
}

/** Where the cursor stands in the printed score, repeats not counted. */
function currentSource(cursor: Cursor): number {
  const iterator = (cursor as unknown as {
    iterator?: { CurrentSourceTimestamp?: { RealValue?: number } };
  }).iterator;
  return iterator?.CurrentSourceTimestamp?.RealValue ?? 0;
}

/**
 * Every moment at which the damper pedal goes down or comes up.
 *
 * Collected raw and handed straight to `core/pedal.ts`, which does the one
 * thing here that can be got wrong — pairing them, past the pedal changes
 * where both marks share a timestamp. This function only walks the object
 * graph, which is all an adapter should do.
 */
function pedalMarks(osmd: OpenSheetMusicDisplay): PedalMark[] {
  const marks: PedalMark[] = [];

  for (const measure of osmd.Sheet?.SourceMeasures ?? []) {
    for (const perStaff of measure.StaffLinkedExpressions ?? []) {
      for (const expression of perStaff ?? []) {
        const at = expression?.AbsoluteTimestamp?.RealValue;
        if (typeof at !== "number" || !Number.isFinite(at)) continue;
        if (expression.PedalStart) marks.push({ at, down: true });
        if (expression.PedalEnd) marks.push({ at, down: false });
      }
    }
  }

  return marks;
}

/** Quarter notes per minute in a measure, or a practice tempo if it names none. */
function tempoOf(measure: { TempoInBPM?: number } | undefined): number {
  const bpm = measure?.TempoInBPM;
  return typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 ? bpm : FALLBACK_BPM;
}

/** OSMD's `RhythmSymbolEnum.CUT`: the time signature is drawn as ¢. */
const CUT = 2;

interface MeasureTime {
  ActiveTimeSignature?: { Numerator?: number; Denominator?: number };
  FirstInstructionsStaffEntries?: Array<{ Instructions?: unknown[] } | undefined>;
}

/**
 * The time signature of every measure, by index.
 *
 * The numbers are on every measure, but the symbol only where a time
 * signature is written, so it is carried forward from there. The symbol
 * matters where it disagrees with the numbers: the Moonlight file draws ¢ and
 * says 4/4. Beethoven wrote alla breve, two half notes to the bar, and that is
 * what a pianist reading ¢ counts — so a ¢ over a whole-note bar is 2/2.
 */
function metersOf(measures: MeasureTime[]): Array<Meter | undefined> {
  let cut = false;
  return measures.map((measure) => {
    for (const entry of measure.FirstInstructionsStaffEntries ?? []) {
      for (const instruction of entry?.Instructions ?? []) {
        const symbol = (instruction as { SymbolEnum?: number; Rhythm?: unknown }).SymbolEnum;
        if (typeof symbol === "number" && "Rhythm" in (instruction as object)) cut = symbol === CUT;
      }
    }

    const beats = measure.ActiveTimeSignature?.Numerator;
    const beatType = measure.ActiveTimeSignature?.Denominator;
    if (!beats || !beatType || !Number.isFinite(beats) || !Number.isFinite(beatType)) return undefined;
    if (cut && beats === beatType) return { beats: 2, beatType: 2 };
    return { beats, beatType };
  });
}

function cursorElement(cursor: Cursor): HTMLElement | undefined {
  return (cursor as unknown as { cursorElement?: HTMLElement }).cursorElement;
}

/**
 * Where a step sits along the staff line, as a fraction of the total width.
 *
 * Measured at the **centre** of the highlight, not its left edge. The
 * highlight straddles the notehead, so its left edge sits noticeably before
 * the note it marks — anchoring there biased every tap towards the following
 * note, which made hitting the intended one unexpectedly fiddly.
 *
 * The position comes from the inline style rather than `offsetLeft`, because
 * OSMD sets that style itself and reading the string costs nothing;
 * `offsetLeft` would force a fresh layout on every one of several hundred
 * steps. The width is passed in, measured once for the whole walk.
 */
function cursorFraction(cursor: Cursor, sheetWidth: number, cursorWidth: number): number {
  const el = cursorElement(cursor);
  if (!el) return 0;

  const styled = Number.parseFloat(el.style.left);
  const left = Number.isFinite(styled) ? styled : el.offsetLeft;
  return (left + cursorWidth / 2) / sheetWidth;
}

function notesUnderCursor(cursor: Cursor): ExpectedNote[] {
  const notes = cursor.NotesUnderCursor();
  if (!notes) return [];

  const collected: ExpectedNote[] = [];

  for (const note of notes) {
    if (note.isRest()) continue;

    const pitch = note.Pitch;
    if (!pitch) continue;

    /*
     * A tie is one sound written as several notes. The first of them carries
     * the length of the whole chain, the rest are already ringing and are
     * flagged so that playback does not strike them again.
     */
    const tie = note.NoteTie;
    const heldOver = tie ? tie.StartNote !== note : false;
    const tieLength = tie?.Duration?.RealValue;
    const ownLength = note.Length?.RealValue ?? 0;

    collected.push({
      // OSMD counts half tones from C0 while MIDI counts from C-1.
      midi: pitch.getHalfTone() + 12,
      staff: staffOf(note),
      // Tuplets need no arithmetic here: OSMD has already divided them, so a
      // triplet eighth arrives as 1/12 of a whole note.
      duration: !heldOver && typeof tieLength === "number" ? tieLength : ownLength,
      heldOver,
    });
  }

  return collected;
}

function staffOf(note: unknown): number {
  const id = (note as { ParentStaffEntry?: { ParentStaff?: { Id?: number } } })
    .ParentStaffEntry?.ParentStaff?.Id;
  return typeof id === "number" ? id : 1;
}

/* ---------------------------------------------------------------- drawing */

/**
 * The engraving on screen: OSMD drawing into a host element inside a
 * horizontally scrolling viewport, with the highlight on one step.
 *
 * The shell says which piece, how large and which step. How OSMD gets there —
 * its cursor, its engraving rules, its render passes — stays in here.
 */
export class ScoreView {
  private readonly osmd: OpenSheetMusicDisplay;
  private readonly host: HTMLElement;
  private readonly viewport: HTMLElement;
  private anchors: number[] = [];
  /** Where OSMD's own cursor stands, so it can be walked rather than rebuilt. */
  private cursorAt = 0;
  /**
   * True after a render. OSMD rebuilds the cursor element on every render, so
   * the next move walks from the start and stretches it again.
   */
  private stale = true;
  /** Guards against a resize arriving while a fit is still rendering. */
  private fitting = false;
  private disposed = false;
  /** The bars of the loop, if one is set, and the element that tints them. */
  private loopBars: { from: number; to: number } | null = null;
  private band: HTMLElement | null = null;
  /** The marks a run in tempo left, by step, and the layer that holds them. */
  private marks: ReadonlyMap<number, Mark> | null = null;
  private markLayer: HTMLElement | null = null;

  constructor(host: HTMLElement, viewport: HTMLElement) {
    this.host = host;
    this.viewport = viewport;
    host.innerHTML = "";
    this.osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false, // re-rendered from outside, through the fit
      backend: "svg",
      drawTitle: false,
      drawComposer: false,
      followCursor: false,
      // Default spacing assumes a printed page and wastes most of a phone
      // screen on margins between the staves.
      drawingParameters: "compacttight",
    });
    tightenForScreen(this.osmd);
  }

  /**
   * Parses and draws a piece, and reads it into the engine's model.
   *
   * Resolves to null when the view was disposed while the file was still
   * being parsed. Drawing then would put the old piece into a host that a new
   * view has already taken over.
   */
  async load(content: string | Blob, title: string, zoom: number): Promise<Score | null> {
    await this.osmd.load(content, title);
    if (this.disposed) return null;

    this.osmd.zoom = zoom;
    this.render();
    this.osmd.cursor.show();

    const { score, anchors } = extractScore(this.osmd, title, this.host);
    this.anchors = anchors;
    this.cursorAt = 0;
    return score;
  }

  get zoom(): number {
    return this.osmd.zoom;
  }

  /** Draws again at another size. Reports whether anything changed. */
  setZoom(zoom: number): boolean {
    if (this.fitting || Math.abs(this.osmd.zoom - zoom) < 0.001) return false;
    this.osmd.zoom = zoom;
    this.render();
    return true;
  }

  /**
   * Scales the engraving until one system fills the viewport's height, within
   * the bounds given, and returns the zoom it settled on.
   *
   * OSMD engraves for a printed page and has no notion of a viewport, so the
   * only way to find the right zoom is to render, measure what came out, and
   * correct. Fixed margins mean one pass undershoots, hence the loop — it
   * converges in two or three.
   */
  fitHeight(min: number, max: number): number {
    if (this.fitting) return this.osmd.zoom;
    this.fitting = true;
    try {
      for (let pass = 0; pass < 4; pass++) {
        const svg = this.host.querySelector("svg");
        const available = this.viewport.clientHeight;
        if (!svg || available <= 0) break;

        const rendered = svg.getBoundingClientRect().height;
        if (rendered <= 0) break;

        const factor = available / rendered;
        if (Math.abs(factor - 1) < 0.04) break;

        const next = clamp(this.osmd.zoom * factor, min, max);
        if (Math.abs(next - this.osmd.zoom) < 0.02) break;

        this.osmd.zoom = next;
        this.render();
      }
    } finally {
      this.fitting = false;
    }
    return this.osmd.zoom;
  }

  /**
   * Puts the highlight on a step and scrolls it into view.
   *
   * Forward only, from wherever the cursor already stands, whenever it can:
   * during playback the highlight moves on every note, and walking from the
   * start each time would turn a Mozart movement of two thousand steps into
   * two million. Backwards, or after a render rebuilt the cursor, it starts
   * over — and that is also the moment the stretch has to be put back.
   */
  show(step: number, behavior: ScrollBehavior): void {
    const cursor = this.osmd.cursor;
    const restart = this.stale || step < this.cursorAt;

    if (restart) {
      cursor.show();
      cursor.reset();
      this.cursorAt = 0;
    }

    let guard = 0;
    while (this.cursorAt < step && guard++ < MAX_STEPS) {
      cursor.next();
      this.cursorAt++;
    }

    if (restart) {
      stretchCursor(this.host);
      this.stale = false;
    }
    scrollIntoView(cursorElement(cursor), this.viewport, behavior);
  }

  /**
   * Tints the bars of a loop, from bar line to bar line, or takes the tint
   * away when given null.
   *
   * The edges come from OSMD's own layout of each bar rather than from the
   * notes, so they sit on the bar lines: measured against the drawn lines of
   * the minuet, within 0.8 px, which is the width of the line itself.
   */
  markLoop(bars: { from: number; to: number } | null): void {
    this.loopBars = bars;
    this.drawLoop();
  }

  /**
   * Puts a sign above each step a run in tempo found fault with — ✗ for a
   * wrong note, ○ for a missed one — or takes them all away when given null.
   *
   * Above the system rather than on the notes, so nothing on the page is
   * covered, and a shape rather than a colour, so it reads without telling
   * red from green. Placed where the highlight stands on that step.
   */
  markSteps(marks: ReadonlyMap<number, Mark> | null): void {
    this.marks = marks && marks.size > 0 ? marks : null;
    this.drawMarks();
  }

  /** The step nearest a point on screen, for a tap; null before anything is drawn. */
  stepAt(clientX: number): number | null {
    const svg = this.host.querySelector("svg");
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (box.width <= 0) return null;
    return stepAtFraction(this.anchors, (clientX - box.left) / box.width);
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.osmd.clear();
    } catch {
      // Torn down before the load finished — nothing to free.
    }
  }

  private render(): void {
    this.osmd.render();
    this.stale = true;
    // A render builds the page anew, and the bars move with the zoom.
    this.drawLoop();
    this.drawMarks();
  }

  private drawMarks(): void {
    const marks = this.marks;
    const svg = this.host.querySelector("svg");
    const page = svg?.parentElement;
    const width = svg?.getBoundingClientRect().width ?? 0;

    if (!marks || !page || width <= 0) {
      this.markLayer?.remove();
      this.markLayer = null;
      return;
    }

    const layer = (this.markLayer ??= document.createElement("div"));
    layer.className = "step-marks";
    layer.replaceChildren(
      ...[...marks].map(([step, mark]) => {
        const sign = document.createElement("span");
        sign.className = `step-mark ${mark}`;
        sign.textContent = mark === "wrong" ? "✗" : "○";
        sign.title = mark === "wrong" ? "falsch" : "verpasst";
        // Anchors are fractions of the line, so they hold at any zoom.
        sign.style.left = `${(this.anchors[step] ?? 0) * width}px`;
        return sign;
      }),
    );
    if (layer.parentElement !== page) page.appendChild(layer);
  }

  private drawLoop(): void {
    const bars = this.loopBars;
    const measures = (this.osmd.GraphicSheet?.MeasureList ?? []) as unknown as MeasureBox[][];
    const first = bars && measures[bars.from - 1]?.find(Boolean);
    const last = bars && measures[bars.to - 1]?.find(Boolean);
    // The page OSMD draws into, where the highlight lives too.
    const page = this.host.querySelector("svg")?.parentElement;

    if (!first || !last || !page) {
      this.band?.remove();
      this.band = null;
      return;
    }

    // OSMD lays out in its own units, ten pixels each at a zoom of one.
    const unit = 10 * this.osmd.zoom;
    const left = first.PositionAndShape.AbsolutePosition.x * unit;
    const right =
      (last.PositionAndShape.AbsolutePosition.x + last.PositionAndShape.Size.width) * unit;

    const band = (this.band ??= document.createElement("div"));
    band.className = "loop-band";
    band.style.left = `${left}px`;
    band.style.width = `${Math.max(0, right - left)}px`;

    // Behind the notes like the highlight, and before it, so the highlight
    // is drawn over the tint and not under it.
    if (band.parentElement !== page) {
      const cursor = page.querySelector('img[id^="cursorImg"]');
      page.insertBefore(band, cursor);
    }
  }
}

/** What a run in tempo found wrong with a step. */
export type Mark = "wrong" | "missed";

/** The part of OSMD's GraphicalMeasure that says where a bar sits. */
interface MeasureBox {
  PositionAndShape: { AbsolutePosition: { x: number }; Size: { width: number } };
}

/**
 * Strips the page-layout assumptions out of the engraving.
 *
 * OSMD lays music out for print: margins for a sheet of paper, room above the
 * first system for the tempo marking. On a screen that space is pure loss, and
 * it costs more than it looks — the system height is uniform across the whole
 * piece, so one "Allegro" in bar 1 drags an empty band along for all 518 steps
 * and shrinks every note to make room for it.
 */
function tightenForScreen(osmd: OpenSheetMusicDisplay): void {
  const rules = osmd.EngravingRules;

  // The whole piece as one continuous line to scroll sideways.
  rules.RenderSingleHorizontalStaffline = true;

  // Tempo wording ("Allegro") and the metronome mark. Both sit in a band above
  // the first system that every later system then inherits. The instrument
  // sets the pace here anyway, not the score.
  rules.RenderFirstTempoExpression = false;
  rules.MetronomeMarksDrawn = false;

  // Paper margins.
  rules.PageTopMargin = 0;
  rules.PageBottomMargin = 0;
  rules.PageLeftMargin = 0;
  rules.PageRightMargin = 0;
}

/**
 * Stretches the cursor highlight to span the whole system.
 *
 * OSMD sizes it to the stave lines alone, so a note on a ledger line — the
 * opening bass octave of the Moonlight Sonata, for one — sits outside the
 * highlight and looks cut off. A fixed factor cannot fix that, because how far
 * notes reach past the lines differs from piece to piece.
 *
 * So the size is measured instead: with the transform cleared, the element
 * reports its natural height, and from that comes the factor that makes it
 * cover the engraving from top to bottom. Scaling from the centre keeps the
 * overhang even above and below.
 *
 * `transform` is the right property for this because OSMD rewrites the inline
 * `top` and `left` on every cursor move but never touches it. The nudge after a
 * wrong note uses `translate`, a property of its own that adds to it.
 */
function stretchCursor(host: HTMLElement): void {
  const svg = host.querySelector("svg");
  const cursor = host.querySelector<HTMLElement>('img[id^="cursorImg"]');
  if (!svg || !cursor) return;

  cursor.style.transform = "none";

  const sheet = svg.getBoundingClientRect();
  const bar = cursor.getBoundingClientRect();
  if (bar.height <= 0 || sheet.height <= 0) return;

  const centre = bar.top + bar.height / 2 - sheet.top;
  // From the centre, reach whichever edge of the system is further away.
  const reach = Math.max(centre, sheet.height - centre);
  const scale = clamp((reach * 2) / bar.height, 1, 4);

  cursor.style.transform = `scaleY(${scale.toFixed(3)})`;
}

function scrollIntoView(
  el: HTMLElement | undefined,
  viewport: HTMLElement,
  behavior: ScrollBehavior,
): void {
  if (!el) return;

  /*
   * Read the position OSMD just wrote, not the one on screen.
   *
   * The highlight glides to its new place over 120ms, so measuring it now
   * reports where it is coming FROM. Forwards that barely shows, because the
   * old position lies left of the new one and the view ends up slightly short.
   * Backwards it is glaring: the old position lies to the RIGHT, so jumping
   * back scrolled forward.
   *
   * The inline `left` is the target, set synchronously and untouched by the
   * transition. It is measured from the OSMD container, which is the scroll
   * content itself, so it compares directly with scrollLeft.
   */
  const styled = Number.parseFloat(el.style.left);
  const left = Number.isFinite(styled)
    ? styled
    : el.getBoundingClientRect().left -
      viewport.getBoundingClientRect().left +
      viewport.scrollLeft;

  const centre = left + el.offsetWidth / 2;
  const target = centre - viewport.clientWidth / 3;

  viewport.scrollTo({ left: Math.max(0, target), behavior });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
