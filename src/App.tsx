import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import "./App.css";

/**
 * SPIKE — not production code.
 *
 * Purpose: find out whether OpenSheetMusicDisplay can lay a whole piece out as
 * ONE horizontal staff line that we can scroll sideways, rather than the
 * page-and-system layout it produces by default. This is the single biggest
 * unknown in the project, so it gets answered before anything else is built.
 */

const SCORES = [
  { label: "Clementi — Sonatina Op. 36 No. 1", url: "/scores/clementi-sonatina-op36-no1.xml" },
  { label: "Beethoven — Moonlight Sonata, 1st mvt.", url: "/scores/moonlight-sonata-mvt1.mxl" },
] as const;

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [scoreUrl, setScoreUrl] = useState<string>(SCORES[0].url);
  const [singleLine, setSingleLine] = useState(true);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [cursorInfo, setCursorInfo] = useState("—");

  // Load and render whenever the score or the layout mode changes.
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    setError(null);
    setStatus("loading");

    // A fresh instance per render avoids stale engraving rules leaking across
    // layout-mode switches.
    host.innerHTML = "";
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: "svg",
      drawTitle: true,
      drawComposer: true,
      followCursor: false,
    });
    osmdRef.current = osmd;

    osmd.EngravingRules.RenderSingleHorizontalStaffline = singleLine;

    osmd
      .load(scoreUrl)
      .then(() => {
        if (cancelled) return;
        setStatus("rendering");
        osmd.render();
        osmd.cursor.show();
        if (cancelled) return;
        setStatus("ready");
        describeCursor(osmd, setCursorInfo);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [scoreUrl, singleLine]);

  function step(direction: "next" | "reset") {
    const osmd = osmdRef.current;
    if (!osmd) return;
    if (direction === "next") osmd.cursor.next();
    else osmd.cursor.reset();
    describeCursor(osmd, setCursorInfo);
    scrollCursorIntoView(osmd, scrollRef.current);
  }

  // Space bar advances — the manual stand-in for "you played the right note".
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      e.preventDefault();
      step("next");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header className="bar">
        <select value={scoreUrl} onChange={(e) => setScoreUrl(e.target.value)}>
          {SCORES.map((s) => (
            <option key={s.url} value={s.url}>{s.label}</option>
          ))}
        </select>

        <label className="toggle">
          <input
            type="checkbox"
            checked={singleLine}
            onChange={(e) => setSingleLine(e.target.checked)}
          />
          single horizontal line
        </label>

        <button onClick={() => step("reset")}>reset</button>
        <button onClick={() => step("next")}>next note (space)</button>

        <span className={`status status-${status}`}>{status}</span>
      </header>

      <p className="cursor-info">cursor: {cursorInfo}</p>

      {error && <pre className="error">{error}</pre>}

      <div className="scroller" ref={scrollRef}>
        <div ref={hostRef} />
      </div>
    </div>
  );
}

/** Reads the notes currently under the cursor — the basis for note matching later. */
function describeCursor(
  osmd: OpenSheetMusicDisplay,
  set: (s: string) => void,
) {
  try {
    const notes = osmd.cursor.NotesUnderCursor();
    if (!notes || notes.length === 0) {
      set("(end of score)");
      return;
    }
    const described = notes
      .filter((n) => !n.isRest())
      .map((n) => {
        const p = n.Pitch;
        return p ? `${p.ToString()} (MIDI ${p.getHalfTone() + 12})` : "?";
      });
    set(described.length ? described.join(", ") : "(rest)");
  } catch (e) {
    set(`error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Keeps the cursor in view while stepping through a long horizontal line. */
function scrollCursorIntoView(
  osmd: OpenSheetMusicDisplay,
  scroller: HTMLDivElement | null,
) {
  if (!scroller) return;
  const el = osmd.cursor?.cursorElement as HTMLElement | undefined;
  if (!el) return;
  const target = el.offsetLeft - scroller.clientWidth / 3;
  scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
}
