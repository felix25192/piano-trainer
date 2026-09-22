import { useCallback, useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { NoteMatcher, type MatchOutcome } from "./core/NoteMatcher";
import { midiToName } from "./core/pitch";
import type { Score } from "./core/score";
import { extractScore } from "./adapters/osmdScore";
import "./App.css";

/**
 * Development shell around the engine.
 *
 * There is no instrument attached yet, so the two buttons stand in for one:
 * "correct" feeds the engine exactly what the score asks for, "wrong" feeds
 * something else. Once MidiInput exists it will call the same `play()` with
 * real notes and nothing else here has to change — that is the point of the
 * NoteInputSource port.
 */

// BASE_URL is "/" during development and "/piano-trainer/" in the build, so
// every bundled asset has to be addressed through it rather than from the root.
const SCORES = [
  {
    label: "Clementi — Sonatina Op. 36 No. 1",
    url: `${import.meta.env.BASE_URL}scores/clementi-sonatina-op36-no1.xml`,
  },
  {
    label: "Beethoven — Moonlight Sonata, 1st mvt.",
    url: `${import.meta.env.BASE_URL}scores/moonlight-sonata-mvt1.mxl`,
  },
] as const;

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const matcherRef = useRef<NoteMatcher | null>(null);
  /** Where OSMD's own cursor stands, so it can be walked to the engine's position. */
  const cursorIndexRef = useRef(0);

  const [scoreUrl, setScoreUrl] = useState<string>(SCORES[0].url);
  const [zoom, setZoom] = useState(1.4);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [tick, setTick] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<MatchOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    setError(null);
    setStatus("loading");
    setScore(null);
    matcherRef.current = null;

    host.innerHTML = "";
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: true,
      backend: "svg",
      drawTitle: false,
      drawComposer: false,
      followCursor: false,
    });
    osmdRef.current = osmd;
    osmd.EngravingRules.RenderSingleHorizontalStaffline = true;

    osmd
      .load(scoreUrl)
      .then(() => {
        if (cancelled) return;
        setStatus("rendering");
        osmd.zoom = zoom;
        osmd.render();
        osmd.cursor.show();

        const label = SCORES.find((s) => s.url === scoreUrl)?.label ?? scoreUrl;
        const extracted = extractScore(osmd, label);

        matcherRef.current = new NoteMatcher(extracted);
        cursorIndexRef.current = 0;
        syncCursor(osmd, matcherRef.current.progress.stepIndex, cursorIndexRef);

        setScore(extracted);
        setStatus("ready");
        setTick((t) => t + 1);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("failed");
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
    // `zoom` is applied here on first render but changed through its own
    // effect, so re-running the whole load for it would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreUrl]);

  // Zoom re-engraves without re-parsing the file.
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !score) return;
    osmd.zoom = zoom;
    osmd.render();
    osmd.cursor.show();
    cursorIndexRef.current = 0;
    const target = matcherRef.current?.progress.stepIndex ?? 0;
    syncCursor(osmd, target, cursorIndexRef);
    scrollCursorIntoView(osmd, scrollRef.current, "auto");
  }, [zoom, score]);

  /** The single entry point for played notes — real or simulated. */
  const play = useCallback((midi: number) => {
    const matcher = matcherRef.current;
    const osmd = osmdRef.current;
    if (!matcher || !osmd) return;

    const outcome = matcher.noteOn({ midi, time: performance.now(), confidence: 1 });
    setLastOutcome(outcome);

    if (outcome.kind === "advanced") {
      syncCursor(osmd, matcher.progress.stepIndex, cursorIndexRef);
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
    const osmd = osmdRef.current;
    if (!osmd || !matcherRef.current) return;
    matcherRef.current.reset();
    osmd.cursor.reset();
    cursorIndexRef.current = 0;
    syncCursor(osmd, matcherRef.current.progress.stepIndex, cursorIndexRef);
    scrollCursorIntoView(osmd, scrollRef.current, "auto");
    setLastOutcome(null);
    setTick((t) => t + 1);
  }, []);

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

  return (
    <div className="app">
      <header className="bar">
        <select value={scoreUrl} onChange={(e) => setScoreUrl(e.target.value)}>
          {SCORES.map((s) => (
            <option key={s.url} value={s.url}>{s.label}</option>
          ))}
        </select>

        <label className="toggle">
          zoom
          <input
            type="range"
            min={0.6}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span className="mono">{zoom.toFixed(1)}×</span>
        </label>

        <button onClick={restart}>restart</button>
        <button onClick={playCorrect}>play correct (space)</button>
        <button onClick={playWrong}>play wrong</button>

        <span className={`status status-${status}`}>{status}</span>
      </header>

      {progress && (
        <div className={`readout ${progress.hasError ? "readout-error" : ""}`}>
          <span>
            measure <b>{progress.measure}</b>
          </span>
          <span>
            step <b>{progress.stepIndex}</b> / {progress.totalSteps}
          </span>
          <span>
            expecting{" "}
            <b className="mono">
              {progress.finished
                ? "— finished —"
                : progress.remaining.map((m) => midiToName(m)).join(" + ") || "—"}
            </b>
          </span>
          {lastOutcome && <span className="mono dim">{describe(lastOutcome)}</span>}
        </div>
      )}

      {error && <pre className="error">{error}</pre>}

      <div className="scroller" ref={scrollRef}>
        <div ref={hostRef} />
      </div>
    </div>
  );
}

function describe(outcome: MatchOutcome): string {
  switch (outcome.kind) {
    case "advanced":
      return "✓ advanced";
    case "progress":
      return `✓ still needs ${outcome.remaining.map((m) => midiToName(m)).join(" + ")}`;
    case "wrong":
      return `✗ ${midiToName(outcome.played)} is not in this step`;
    case "ignored":
      return `· ignored (${outcome.reason})`;
  }
}

/**
 * Walks OSMD's cursor to the engine's position. The two can drift apart
 * because the engine skips rests and OSMD does not.
 */
function syncCursor(
  osmd: OpenSheetMusicDisplay,
  targetIndex: number,
  currentIndex: { current: number },
): void {
  let guard = 0;
  while (currentIndex.current < targetIndex && guard++ < 10_000) {
    osmd.cursor.next();
    currentIndex.current++;
  }
}

function scrollCursorIntoView(
  osmd: OpenSheetMusicDisplay,
  scroller: HTMLDivElement | null,
  behavior: ScrollBehavior,
): void {
  if (!scroller) return;
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
