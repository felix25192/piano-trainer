import { useCallback, useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { NoteMatcher } from "./core/NoteMatcher";
import type { Score } from "./core/score";
import { extractScore, stepAtFraction } from "./adapters/osmdScore";
import {
  addScore,
  getScoreBlob,
  isLibrarySupported,
  listScores,
  removeScore,
  type LibraryEntry,
} from "./adapters/scoreLibrary";
import { scoreFileAccept } from "./core/scoreFile";
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

/**
 * A piece comes either with the app or from the user's own files. Both end up
 * as something OSMD can load — a URL or a Blob — but they are told apart here
 * so the settings list can offer a delete for one and not the other.
 */
type Selection =
  | { kind: "bundled"; key: string; label: string; url: string; hint?: string }
  | { kind: "library"; key: string; label: string; id: string; hint?: string };

function bundled(key: string, label: string, file: string, hint: string): Selection {
  // BASE_URL is "/" during development and "/piano-trainer/" in the build, so
  // bundled assets have to be addressed through it rather than from the root.
  return { kind: "bundled", key, label, hint, url: `${import.meta.env.BASE_URL}scores/${file}` };
}

/**
 * A graded set, easiest first.
 *
 * Picked for reading rather than for playing: what matters is variety per bar
 * and, above all, being unfamiliar. A piece you know by ear lets your memory
 * do the work while your eyes learn nothing — which is exactly why someone can
 * play the Moonlight from memory and still not read.
 */
const BUNDLED: Selection[] = [
  bundled(
    "bach-minuet",
    "Bach — Menuett G-Dur BWV Anh. 114",
    "bach-minuet-g-bwv-anh114.mxl",
    "leicht · klare Zweistimmigkeit, 32 Takte",
  ),
  bundled(
    "danse-villageoise",
    "Beethoven — Danse villageoise",
    "beethoven-danse-villageoise.mxl",
    "leicht · kennst du vermutlich nicht — darum ideal",
  ),
  bundled(
    "bach-prelude",
    "Bach — Präludium C-Dur BWV 846",
    "bach-prelude-c-bwv846.mxl",
    "leicht · gleiche Figur, ständig neue Harmonien",
  ),
  bundled(
    "clementi",
    "Clementi — Sonatine op. 36 Nr. 1",
    "clementi-sonatina-op36-no1.xml",
    "mittel · seit 200 Jahren das Übungsstück dafür",
  ),
  bundled(
    "mozart-k545",
    "Mozart — Sonate KV 545, 1. Satz",
    "mozart-sonata-k545-mvt1.mxl",
    "mittel · die „Sonata facile“",
  ),
  bundled(
    "chopin-nocturne",
    "Chopin — Nocturne cis-Moll op. posth.",
    "chopin-nocturne-cs-minor-posth.mxl",
    "anspruchsvoll · vier Kreuze, freie Rhythmen",
  ),
  bundled(
    "moonlight",
    "Beethoven — Mondscheinsonate, 1. Satz",
    "moonlight-sonata-mvt1.mxl",
    "anspruchsvoll · Triolen, vier Kreuze",
  ),
];

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
  /** Where each step sits along the line, as a fraction of the total width. */
  const anchorsRef = useRef<number[]>([]);
  /** Start of the current pointer gesture, to tell a tap from a scroll swipe. */
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  const [selected, setSelected] = useState<Selection>(BUNDLED[0]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [autoFit, setAutoFit] = useState(true);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  /**
   * Which panel is open, if any.
   *
   * Pieces and measures get their own, reachable by tapping what they show in
   * the bar. Both are things you change *while* practising, so routing them
   * through a settings menu would be a detour taken dozens of times an hour.
   */
  const [sheet, setSheet] = useState<"pieces" | "measures" | "settings" | null>(null);
  const [tick, setTick] = useState(0);

  // Pieces the user brought along, read once on start. The piece that was open
  // last is reopened with them, so sitting down at the piano and reloading
  // does not mean hunting for it again.
  useEffect(() => {
    if (!isLibrarySupported()) {
      restoreLastPiece(BUNDLED, setSelected);
      return;
    }
    listScores()
      .then((entries) => {
        setLibrary(entries);
        restoreLastPiece(
          [
            ...BUNDLED,
            ...entries.map(
              (e): Selection => ({
                kind: "library",
                key: `lib:${e.id}`,
                label: e.title,
                id: e.id,
              }),
            ),
          ],
          setSelected,
        );
      })
      .catch((e: unknown) => setLibraryError(describeError(e)));
  }, []);

  /**
   * Opens a piece and remembers it for next time.
   *
   * The remembering deliberately hangs off the act of choosing rather than off
   * a change of state. As an effect on `selected` it would fire once on mount
   * with the default still in place and overwrite the very value the restore
   * is about to read — the restore runs later, because the library list
   * arrives asynchronously.
   */
  const choosePiece = useCallback((piece: Selection) => {
    setSelected(piece);
    rememberLastPiece(piece.key);
  }, []);

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
    // Every re-render rebuilds the cursor element, so its stretch has to be
    // reapplied. Doing it here means no render path can forget it.
    stretchCursor(hostRef.current);
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

    // A bundled piece is a URL OSMD fetches itself; one of the user's own is a
    // Blob out of storage. `load` takes either.
    const source: Promise<string | Blob> =
      selected.kind === "bundled"
        ? Promise.resolve(selected.url)
        : getScoreBlob(selected.id).then((blob) => {
            if (!blob) throw new Error("Diese Datei liegt nicht mehr im Speicher.");
            return blob;
          });

    source
      .then((content) => osmd.load(content, selected.label))
      .then(() => {
        if (cancelled) return;
        osmd.zoom = zoom;
        osmd.render();
        osmd.cursor.show();

        const { score: extracted, anchors } = extractScore(osmd, selected.label, host);

        matcherRef.current = new NoteMatcher(extracted);
        anchorsRef.current = anchors;
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
  }, [selected]);

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
    setTick((t) => t + 1);
  }, [restoreCursor]);

  const jumpToMeasure = useCallback(
    (measure: number) => {
      matcherRef.current?.seekToMeasure(measure);
      restoreCursor();
      scrollCursorIntoView(osmdRef.current, scrollRef.current, "smooth");
      setSheet(null);
      setTick((t) => t + 1);
    },
    [restoreCursor],
  );

  // A tap in the score starts from there. Practising means repeating one
  // awkward bar, not the opening.
  const onScorePointerDown = useCallback((e: React.PointerEvent) => {
    pressRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onScorePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press) return;

      // Scrolling the score is a swipe and must not move the position. Only a
      // gesture that stayed put counts as aiming at a note.
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (moved > 10) return;

      const matcher = matcherRef.current;
      const svg = scrollRef.current?.querySelector("svg");
      if (!matcher || !svg) return;

      const box = svg.getBoundingClientRect();
      if (box.width <= 0) return;

      const fraction = (e.clientX - box.left) / box.width;
      matcher.seekToStep(stepAtFraction(anchorsRef.current, fraction));

      restoreCursor();
      scrollCursorIntoView(osmdRef.current, scrollRef.current, "smooth");
      setTick((t) => t + 1);
    },
    [restoreCursor],
  );

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

  const pieceLabel = selected.label;
  const busy = status !== "bereit";

  function setZoomManually(next: number) {
    setAutoFit(false);
    setZoom(round(clamp(next, ZOOM_MIN, ZOOM_MAX)));
  }

  /**
   * Measures that actually hold something to play.
   *
   * A piece can open with a bar of rests in one hand, and offering a jump to a
   * measure that needs no input would land the position somewhere else without
   * explanation.
   */
  const measureNumbers = score
    ? [
        ...new Set(
          score.steps.filter((s) => s.notes.length > 0).map((s) => s.measure),
        ),
      ].sort((a, b) => a - b)
    : [];

  const pieces: Selection[] = [
    ...BUNDLED,
    ...library.map(
      (entry): Selection => ({
        kind: "library",
        key: `lib:${entry.id}`,
        label: entry.title,
        id: entry.id,
      }),
    ),
  ];

  async function onFilesPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    // Clearing the input means picking the same file twice in a row still
    // fires a change event.
    event.target.value = "";
    if (files.length === 0) return;

    setLibraryError(null);
    const added: LibraryEntry[] = [];

    for (const file of files) {
      try {
        added.push(await addScore(file));
      } catch (e: unknown) {
        setLibraryError(describeError(e));
      }
    }

    if (added.length === 0) return;

    setLibrary((prev) => [...added, ...prev]);
    // Open the first new piece straight away — that is why it was added.
    const first = added[0];
    choosePiece({
      kind: "library",
      key: `lib:${first.id}`,
      label: first.title,
      id: first.id,
    });
    setSheet(null);
  }

  async function onRemovePiece(entry: LibraryEntry) {
    if (!window.confirm(`„${entry.title}" entfernen?`)) return;

    try {
      await removeScore(entry.id);
    } catch (e: unknown) {
      setLibraryError(describeError(e));
      return;
    }

    setLibrary((prev) => prev.filter((e) => e.id !== entry.id));
    if (selected.kind === "library" && selected.id === entry.id) {
      choosePiece(BUNDLED[0]);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="piece" onClick={() => setSheet("pieces")}>
          <span className="label">{pieceLabel}</span>
          <span className="caret">▾</span>
        </button>

        <button
          className="measure"
          onClick={() => setSheet("measures")}
          disabled={!score}
        >
          Takt {progress && !progress.finished ? progress.measure : "—"}
          <span className="caret">▾</span>
        </button>
        {/*
          The expected notes are deliberately NOT shown. Naming them turns the
          exercise into reading text instead of reading notation, which is the
          whole point of the app. The highlight turning red says "that was
          wrong" without giving the answer away.
        */}
        <span className="expect">{busy ? status : progress?.finished ? "zu Ende" : ""}</span>
        <button
          className="icon-button"
          onClick={() => setSheet("settings")}
          aria-label="Einstellungen"
        >
          ⚙
        </button>
      </header>

      {error && <pre className="error-box">{error}</pre>}

      <div
        className={"scroller" + (progress?.hasError ? " wrong" : "")}
        ref={scrollRef}
        onPointerDown={onScorePointerDown}
        onPointerUp={onScorePointerUp}
        onPointerCancel={() => (pressRef.current = null)}
      >
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

      {sheet && (
        <>
          <button className="backdrop" onClick={() => setSheet(null)} aria-label="Schließen" />

          {sheet === "pieces" && (
            <div className="sheet" role="dialog" aria-label="Stück wählen">
              <h2>Stück</h2>

              <ul className="pieces">
                {pieces.map((piece) => {
                  const entry =
                    piece.kind === "library"
                      ? library.find((e) => e.id === piece.id)
                      : undefined;
                  return (
                    <li key={piece.key} className={piece.key === selected.key ? "current" : ""}>
                      <button
                        className="pick"
                        onClick={() => {
                          choosePiece(piece);
                          setSheet(null);
                        }}
                      >
                        <span className="text">
                          <span className="name">{piece.label}</span>
                          {piece.hint && <span className="sub">{piece.hint}</span>}
                        </span>
                        {entry && <span className="meta">{formatSize(entry.size)}</span>}
                      </button>
                      {entry && (
                        <button
                          className="remove"
                          onClick={() => onRemovePiece(entry)}
                          aria-label={`${piece.label} entfernen`}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {isLibrarySupported() ? (
                <label className="add-file">
                  <input type="file" accept={scoreFileAccept()} multiple onChange={onFilesPicked} />
                  <span>Eigene Noten hinzufügen</span>
                </label>
              ) : (
                <p className="hint">Dieser Browser kann keine eigenen Stücke speichern.</p>
              )}

              {libraryError && <p className="warn">{libraryError}</p>}

              <p className="hint">
                MusicXML als .mxl, .musicxml oder .xml. Die Dateien bleiben auf diesem
                Gerät und werden nirgendwohin geschickt.
              </p>

              <button className="close" onClick={() => setSheet(null)}>Fertig</button>
            </div>
          )}

          {sheet === "measures" && (
            <div className="sheet" role="dialog" aria-label="Takt wählen">
              <h2>Takt</h2>

              <div className="measures">
                {measureNumbers.map((number) => (
                  <button
                    key={number}
                    className={number === progress?.measure ? "current" : ""}
                    onClick={() => jumpToMeasure(number)}
                  >
                    {number}
                  </button>
                ))}
              </div>

              <p className="hint">
                Schneller geht es, indem du direkt ins Notenbild tippst — dort landest
                du auf der Note statt am Taktanfang.
              </p>

              <button className="close" onClick={() => setSheet(null)}>Fertig</button>
            </div>
          )}

          {sheet === "settings" && (
            <div className="sheet" role="dialog" aria-label="Einstellungen">
              <h2>Einstellungen</h2>

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
                <p className="hint">Von Hand einstellen schaltet die automatische Anpassung ab.</p>
              </div>

              <button className="close" onClick={() => setSheet(null)}>Fertig</button>
            </div>
          )}
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
 * `top` and `left` on every cursor move but never touches it.
 */
function stretchCursor(host: HTMLElement | null): void {
  const svg = host?.querySelector("svg");
  const cursor = host?.querySelector<HTMLElement>('img[id^="cursorImg"]');
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const LAST_PIECE_KEY = "piano-trainer.lastPiece";

/**
 * Which piece was open last.
 *
 * localStorage is right for this and wrong for the scores themselves: it holds
 * one short string, and losing it costs nothing more than a tap. Every access
 * is guarded because it throws outright in a private window or with site data
 * blocked.
 */
function rememberLastPiece(key: string): void {
  try {
    localStorage.setItem(LAST_PIECE_KEY, key);
  } catch {
    // Storage unavailable. The app works, it just forgets.
  }
}

function restoreLastPiece(
  available: Selection[],
  select: (piece: Selection) => void,
): void {
  let key: string | null = null;
  try {
    key = localStorage.getItem(LAST_PIECE_KEY);
  } catch {
    return;
  }
  if (!key) return;

  // The piece may have been deleted since; then the default stands.
  const found = available.find((p) => p.key === key);
  if (found) select(found);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Avoids 1.7999999999999998 from repeated floating point addition. */
function round(z: number): number {
  return Math.round(z * 10) / 10;
}

function scrollCursorIntoView(
  osmd: OpenSheetMusicDisplay | null,
  scroller: HTMLDivElement | null,
  behavior: ScrollBehavior,
): void {
  if (!osmd || !scroller) return;
  const el = osmd.cursor?.cursorElement as HTMLElement | undefined;
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
      scroller.getBoundingClientRect().left +
      scroller.scrollLeft;

  const centre = left + el.offsetWidth / 2;
  const target = centre - scroller.clientWidth / 3;

  scroller.scrollTo({ left: Math.max(0, target), behavior });
}
