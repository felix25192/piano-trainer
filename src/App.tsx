import { useCallback, useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { NoteMatcher, type MatchOutcome } from "./core/NoteMatcher";
import { midiToName } from "./core/pitch";
import type { Score } from "./core/score";
import { extractScore } from "./adapters/osmdScore";
import "./App.css";

/**
 * Development shell around the engine, laid out for a tablet or phone held in
 * landscape on a music stand.
 *
 * While practising, the screen is never touched — both hands are on the keys
 * and the instrument drives the app. So the score gets the room and the
 * controls stay out of the way. The two buttons at the bottom stand in for an
 * instrument until MidiInput is wired up; they call the same `play()` a real
 * adapter will, which is what the NoteInputSource port buys us.
 */

// BASE_URL is "/" during development and "/piano-trainer/" in the build, so
// every bundled asset has to be addressed through it rather than from the root.
const SCORES = [
  {
    label: "Clementi — Sonatina Op. 36 No. 1",
    url: `${import.meta.env.BASE_URL}scores/clementi-sonatina-op36-no1.xml`,
  },
  {
    label: "Beethoven — Mondscheinsonate, 1. Satz",
    url: `${import.meta.env.BASE_URL}scores/moonlight-sonata-mvt1.mxl`,
  },
] as const;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const matcherRef = useRef<NoteMatcher | null>(null);
  /** Where OSMD's own cursor stands, so it can be walked to the engine's position. */
  const cursorIndexRef = useRef(0);
  /** Guards against the resize observer re-entering while a fit is running. */
  const fittingRef = useRef(false);

  const [scoreUrl, setScoreUrl] = useState<string>(SCORES[0].url);
  const [zoom, setZoom] = useState(1.2);
  const [autoFit, setAutoFit] = useState(true);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<MatchOutcome | null>(null);

  /** Puts OSMD's cursor back where the engine stands after a re-render. */
  const restoreCursor = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd) return;
    osmd.cursor.show();
    osmd.cursor.reset();
    cursorIndexRef.current = 0;
    const target = matcherRef.current?.progress.stepIndex ?? 0;
    let guard = 0;
    while (cursorIndexRef.current < target && guard++ < 10_000) {
      osmd.cursor.next();
      cursorIndexRef.current++;
    }
  }, []);

  /**
   * Scales the engraving until one system fills the available height.
   *
   * OSMD engraves for a printed page and has no notion of a viewport, so the
   * only way to find the right zoom is to render, measure what came out, and
   * correct. Fixed margins mean one pass undershoots, hence the loop — it
   * converges in two or three.
   */
  const applyFit = useCallback(() => {
    const osmd = osmdRef.current;
    const scroller = scrollRef.current;
    if (!osmd || !scroller || fittingRef.current) return;

    fittingRef.current = true;
    try {
      for (let pass = 0; pass < 4; pass++) {
        const svg = scroller.querySelector("svg");
        const available = scroller.clientHeight;
        if (!svg || available <= 0) break;

        const rendered = svg.getBoundingClientRect().height;
        if (rendered <= 0) break;

        const factor = available / rendered;
        if (Math.abs(factor - 1) < 0.04) break;

        const next = clamp(osmd.zoom * factor, ZOOM_MIN, ZOOM_MAX);
        if (Math.abs(next - osmd.zoom) < 0.02) break;

        osmd.zoom = next;
        osmd.render();
      }
      setZoom(round(osmd.zoom));
      restoreCursor();
      scrollCursorIntoView(osmd, scroller, "auto");
    } finally {
      fittingRef.current = false;
    }
  }, [restoreCursor]);

  // Load and render whenever the piece changes.
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    setError(null);
    setStatus("lädt");
    setScore(null);
    matcherRef.current = null;

    host.innerHTML = "";
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false, // we re-render ourselves, through the fit
      backend: "svg",
      drawTitle: false,
      drawComposer: false,
      followCursor: false,
      // Default spacing assumes a printed page and wastes most of a phone
      // screen on margins between the staves.
      drawingParameters: "compacttight",
    });
    osmdRef.current = osmd;
    tightenForScreen(osmd);

    osmd
      .load(scoreUrl)
      .then(() => {
        if (cancelled) return;
        osmd.zoom = zoom;
        osmd.render();
        osmd.cursor.show();

        const label = SCORES.find((s) => s.url === scoreUrl)?.label ?? scoreUrl;
        const extracted = extractScore(osmd, label);

        matcherRef.current = new NoteMatcher(extracted);
        setScore(extracted);
        setStatus("bereit");

        if (autoFit) applyFit();
        else restoreCursor();

        setTick((t) => t + 1);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("fehlgeschlagen");
      });

    return () => {
      cancelled = true;
      try {
        osmd.clear();
      } catch {
        // Torn down before the load finished — nothing to free.
      }
      if (osmdRef.current === osmd) osmdRef.current = null;
    };
    // zoom and autoFit are read once here; changing them must not re-parse the
    // file, so they drive their own effects instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreUrl]);

  // Manual zoom: re-engrave without re-parsing.
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !score || autoFit || fittingRef.current) return;
    if (Math.abs(osmd.zoom - zoom) < 0.001) return;
    osmd.zoom = zoom;
    osmd.render();
    restoreCursor();
    scrollCursorIntoView(osmd, scrollRef.current, "auto");
  }, [zoom, score, autoFit, restoreCursor]);

  // Re-fit when the viewport changes — rotating the device is the main case.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !score || !autoFit) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applyFit());
    });
    observer.observe(scroller);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [score, autoFit, applyFit]);

  /** The single entry point for played notes — real or simulated. */
  const play = useCallback((midi: number) => {
    const matcher = matcherRef.current;
    const osmd = osmdRef.current;
    if (!matcher || !osmd) return;

    const outcome = matcher.noteOn({ midi, time: performance.now(), confidence: 1 });
    setLastOutcome(outcome);

    if (outcome.kind === "advanced") {
      let guard = 0;
      while (cursorIndexRef.current < matcher.progress.stepIndex && guard++ < 10_000) {
        osmd.cursor.next();
        cursorIndexRef.current++;
      }
      scrollCursorIntoView(osmd, scrollRef.current, "smooth");
    }
    setTick((t) => t + 1);
  }, []);

  const playCorrect = useCallback(() => {
    const next = matcherRef.current?.remaining[0];
    if (next !== undefined) play(next);
  }, [play]);

  const playWrong = useCallback(() => {
    const expected = matcherRef.current?.remaining ?? [];
    // A semitone off is the mistake a sight-reader actually makes.
    let candidate = (expected[0] ?? 60) + 1;
    while (expected.includes(candidate)) candidate++;
    play(candidate);
  }, [play]);

  const restart = useCallback(() => {
    matcherRef.current?.reset();
    restoreCursor();
    scrollCursorIntoView(osmdRef.current, scrollRef.current, "auto");
    setLastOutcome(null);
    setTick((t) => t + 1);
  }, [restoreCursor]);

  // Registered once; the ref keeps the space bar on the same path as the button.
  const playCorrectRef = useRef(playCorrect);
  playCorrectRef.current = playCorrect;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      e.preventDefault();
      playCorrectRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress = matcherRef.current?.progress;
  void tick; // progress is read off a ref; `tick` is what forces the re-read

  const pieceLabel = SCORES.find((s) => s.url === scoreUrl)?.label ?? "—";
  const busy = status !== "bereit";

  function setZoomManually(next: number) {
    setAutoFit(false);
    setZoom(round(clamp(next, ZOOM_MIN, ZOOM_MAX)));
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="piece">{pieceLabel}</span>
        {progress && !progress.finished && (
          <span className="measure">Takt {progress.measure}</span>
        )}
        <span
          className={
            "expect" +
            (progress?.hasError ? " error" : "") +
            (progress?.finished ? " done" : "")
          }
        >
          {busy ? status : expectation(progress, lastOutcome)}
        </span>
        <button
          className="icon-button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Einstellungen"
        >
          ⚙
        </button>
      </header>

      {error && <pre className="error-box">{error}</pre>}

      <div className="scroller" ref={scrollRef}>
        <div ref={hostRef} />
      </div>

      <div className="actions">
        <button className="secondary" onClick={restart} aria-label="Von vorn" disabled={busy}>
          ↺
        </button>
        <button className="primary" onClick={playCorrect} disabled={busy || progress?.finished}>
          richtigen Ton spielen
        </button>
        <button
          className="secondary"
          onClick={playWrong}
          aria-label="Falschen Ton spielen"
          disabled={busy || progress?.finished}
        >
          ✗
        </button>
      </div>

      {settingsOpen && (
        <>
          <button
            className="backdrop"
            onClick={() => setSettingsOpen(false)}
            aria-label="Einstellungen schließen"
          />
          <div className="sheet" role="dialog" aria-label="Einstellungen">
            <h2>Einstellungen</h2>

            <label className="field">
              <span>Stück</span>
              <select value={scoreUrl} onChange={(e) => setScoreUrl(e.target.value)}>
                {SCORES.map((s) => (
                  <option key={s.url} value={s.url}>{s.label}</option>
                ))}
              </select>
            </label>

            <label className="row-toggle">
              An die Bildschirmhöhe anpassen
              <input
                type="checkbox"
                checked={autoFit}
                onChange={(e) => setAutoFit(e.target.checked)}
              />
            </label>

            <div className="field">
              <span>Notengröße</span>
              <div className="stepper">
                <button
                  onClick={() => setZoomManually(zoom - ZOOM_STEP)}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Kleiner"
                >
                  −
                </button>
                <output>{zoom.toFixed(1)}×</output>
                <button
                  onClick={() => setZoomManually(zoom + ZOOM_STEP)}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Größer"
                >
                  +
                </button>
              </div>
              <p className="hint">
                Von Hand einstellen schaltet die automatische Anpassung ab.
              </p>
            </div>

            <button className="close" onClick={() => setSettingsOpen(false)}>
              Fertig
            </button>
          </div>
        </>
      )}
    </div>
  );
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Avoids 1.7999999999999998 from repeated floating point addition. */
function round(z: number): number {
  return Math.round(z * 10) / 10;
}

function expectation(
  progress: { remaining: number[]; finished: boolean } | undefined,
  outcome: MatchOutcome | null,
): React.ReactNode {
  if (!progress) return "—";
  if (progress.finished) return <b>zu Ende</b>;

  if (outcome?.kind === "wrong") {
    return (
      <>
        {midiToName(outcome.played)} ✗ — erwartet{" "}
        <b>{outcome.expected.map((m) => midiToName(m)).join(" ")}</b>
      </>
    );
  }

  return (
    <>
      erwartet <b>{progress.remaining.map((m) => midiToName(m)).join(" ") || "—"}</b>
    </>
  );
}

function scrollCursorIntoView(
  osmd: OpenSheetMusicDisplay | null,
  scroller: HTMLDivElement | null,
  behavior: ScrollBehavior,
): void {
  if (!osmd || !scroller) return;
  const el = osmd.cursor?.cursorElement as HTMLElement | undefined;
  if (!el) return;

  // Measure both in viewport coordinates, then convert to the scroller's own
  // scroll axis. offsetLeft would silently mix coordinate systems, since the
  // cursor's offset parent is OSMD's container rather than the scroller.
  const cursorLeft = el.getBoundingClientRect().left;
  const scrollerLeft = scroller.getBoundingClientRect().left;
  const target =
    scroller.scrollLeft + (cursorLeft - scrollerLeft) - scroller.clientWidth / 3;

  scroller.scrollTo({ left: Math.max(0, target), behavior });
}
