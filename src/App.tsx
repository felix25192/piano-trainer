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
import { buildExercise, keyName, type ExerciseOptions } from "./core/exercises";
import { exerciseToMusicXml } from "./core/musicxml";
import { keyOf, type Key, type Letter } from "./core/theory";
import { buildSchedule, stepAtTime, type Schedule } from "./core/playback";
import type { NoteOutput } from "./core/NoteOutput";
import { isAudioSupported, SampledPiano } from "./adapters/SampledPiano";
import Home, { type ModeId } from "./Home";
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
 * Home screen or score — the app only ever shows one of the two.
 *
 * Nothing about the score survives a detour to the home screen: OSMD is torn
 * down with it and the piece is parsed again on the way back. That costs a
 * moment, and it keeps the teardown honest: the alternative is a hidden
 * renderer kept alive, fitting itself to a container that is no longer on
 * screen.
 */
type View = "home" | "practice";

/**
 * A piece comes either with the app or from the user's own files. Both end up
 * as something OSMD can load — a URL or a Blob — but they are told apart here
 * so the settings list can offer a delete for one and not the other.
 */
type Selection =
  | { kind: "bundled"; key: string; label: string; url: string; hint?: string }
  | { kind: "library"; key: string; label: string; id: string; hint?: string }
  | { kind: "exercise"; key: string; label: string; options: ExerciseOptions; hint?: string };

/**
 * An exercise is described entirely by its options, so its key can carry them.
 *
 * That is what lets the last one be reopened after a reload: there is nothing
 * stored anywhere, the exercise is simply generated again from its name.
 */
function exerciseSelection(options: ExerciseOptions): Selection {
  const { kind, key, octaves, motion, fingerings } = options;
  return {
    kind: "exercise",
    // The fingering setting belongs in the key too: flipping it has to produce
    // a different selection, or the score would not be regenerated.
    key: `ex:${kind}:${key.tonic}:${key.tonicAlter}:${key.mode}:${octaves}:${motion}:${fingerings}`,
    label: buildExercise(options).title,
    options,
  };
}

function parseExerciseKey(encoded: string): Selection | null {
  const [prefix, kind, tonic, alter, mode, octaves, motion, fingerings] = encoded.split(":");
  if (prefix !== "ex") return null;

  try {
    return exerciseSelection({
      kind: kind as ExerciseOptions["kind"],
      key: keyOf(tonic as Letter, Number(alter), mode as "major" | "harmonicMinor"),
      octaves: Number(octaves),
      motion: motion as ExerciseOptions["motion"],
      fingerings: fingerings !== "false",
    });
  } catch {
    return null;
  }
}

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

/**
 * As large as the automatic fit is allowed to go on its own.
 *
 * Without a ceiling the fit blows one system up to the full height of whatever
 * it is given, and on a tall window that is far past comfortable — a single
 * bar filling the screen reads worse than three of them, because sight-reading
 * lives on seeing what comes next. The value is chosen by eye, not measured;
 * past it the score stops growing and leaves the rest of the page white.
 * Setting the size by hand still reaches ZOOM_MAX.
 */
const ZOOM_FIT_MAX = 2;

/**
 * The keys offered, in circle-of-fifths order — C, then one sharp more each
 * step, wrapping round through the flats back to F.
 *
 * Twelve of each, and the minor list holds the relative minor of the major
 * beside it. Spelled the way they are normally written: E flat minor rather
 * than D sharp minor, since six flats beat six sharps plus a double.
 */
const MAJOR_KEYS: Array<[Letter, number]> = [
  ["C", 0], ["G", 0], ["D", 0], ["A", 0], ["E", 0], ["B", 0],
  ["F", 1], ["D", -1], ["A", -1], ["E", -1], ["B", -1], ["F", 0],
];

const MINOR_KEYS: Array<[Letter, number]> = [
  ["A", 0], ["E", 0], ["B", 0], ["F", 1], ["C", 1], ["G", 1],
  ["E", -1], ["B", -1], ["F", 0], ["C", 0], ["G", 0], ["D", 0],
];

/**
 * Speeds offered for playing a passage back, as a share of what is written.
 *
 * The score's own tempo is the default, because hearing it as meant is the
 * point. But the marks in these files are performance tempi — the Beethoven
 * asks for 180 — and a passage you cannot follow teaches nothing, so the
 * slower steps are there for a first pass.
 */
/**
 * How long to keep the playback alive after the last note is due.
 *
 * Stopping the moment the written length runs out would cut the damper off
 * mid-fall and leave a click where the piece should fade. A few tenths cover
 * the release the output puts on every note.
 */
const PLAYBACK_TAIL_SECONDS = 0.5;

/**
 * How often the highlight checks where the sound has got to.
 *
 * Fine enough that no note is missed even in the fastest passage, coarse
 * enough not to wake up for nothing between them.
 */
const FOLLOW_MS = 40;

const TEMPO_FACTORS: Array<[number, string]> = [
  [0.5, "50 %"],
  [0.75, "75 %"],
  [1, "wie notiert"],
];

const KIND_LABELS: Array<[ExerciseOptions["kind"], string]> = [
  ["scale", "Tonleiter"],
  ["arpeggio", "Arpeggio"],
  ["fiveFinger", "Fünf Finger"],
];

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
  /**
   * Where practice stood when the home screen was opened.
   *
   * Going home throws the matcher away with the renderer, so the step is kept
   * here and seeked back to once the same piece has been parsed again. Without
   * it a card that says "weiter üben" would drop you at bar one.
   */
  const resumeStepRef = useRef<{ key: string; step: number } | null>(null);
  /** The sound output, built on the first tap of play and kept afterwards. */
  const outputRef = useRef<NoteOutput | null>(null);
  /** What is currently being played back, so the cursor can be kept on it. */
  const scheduleRef = useRef<Schedule | null>(null);
  /** The timer that keeps the highlight on the note being heard. */
  const followRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Selection>(BUNDLED[0]);
  /** Whether there is a piece from last time to offer on the home screen. */
  const [resumable, setResumable] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [autoFit, setAutoFit] = useState(true);
  const [fingerings, setFingerings] = useState(true);

  // What the exercise builder currently has set.
  const [draft, setDraft] = useState<Omit<ExerciseOptions, "fingerings">>({
    kind: "scale",
    key: keyOf("C", 0, "major"),
    octaves: 2,
    motion: "parallel",
  });
  /**
   * Idle, fetching recordings, or sounding.
   *
   * Loading is its own state rather than a flag beside "playing", because the
   * first press of a session waits on a couple of megabytes of piano and the
   * button has to say so instead of looking dead.
   */
  const [playback, setPlayback] = useState<"idle" | "loading" | "playing">("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [tempoFactor, setTempoFactor] = useState(1);
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
  const [sheet, setSheet] = useState<
    "pieces" | "measures" | "settings" | "exercise" | null
  >(null);
  const [tick, setTick] = useState(0);

  // Pieces the user brought along, read once on start. The piece that was open
  // last is reopened with them, so sitting down at the piano and reloading
  // does not mean hunting for it again.
  useEffect(() => {
    if (!isLibrarySupported()) {
      setResumable(restoreLastPiece(BUNDLED, setSelected));
      return;
    }
    listScores()
      .then((entries) => {
        setLibrary(entries);
        const restored = restoreLastPiece(
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
        setResumable(restored);
      })
      .catch((e: unknown) => setLibraryError(describeError(e)));
  }, []);

  /**
   * Walks OSMD's cursor forward to where the engine stands.
   *
   * Forward only, and from wherever it already is — unlike `restoreCursor`,
   * which rewinds first. That matters during playback: rewinding and stepping
   * through from the start on every note would turn a Mozart movement of two
   * thousand steps into two million.
   */
  const advanceCursor = useCallback(() => {
    const osmd = osmdRef.current;
    const target = matcherRef.current?.progress.stepIndex ?? 0;
    if (!osmd) return;

    let guard = 0;
    while (cursorIndexRef.current < target && guard++ < 10_000) {
      osmd.cursor.next();
      cursorIndexRef.current++;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (followRef.current !== null) {
      clearInterval(followRef.current);
      followRef.current = null;
    }
    outputRef.current?.stop();
    scheduleRef.current = null;
    setPlayback("idle");
  }, []);

  /**
   * Keeps the highlight on the note being heard.
   *
   * It asks the output where it stands rather than counting frames or adding
   * up intervals, because that is the same clock the notes are scheduled
   * against. Anything else would drift, and a highlight half a bar away from
   * the sound is worse than none.
   *
   * Driven by a timer and not by `requestAnimationFrame`, although this moves
   * something on screen. Animation frames stop entirely while the window is
   * not drawing, and the sound does not — so the piece would finish unheard by
   * the app, leaving the stop button lit and the position frozen mid-piece.
   * A timer is throttled there rather than halted, which is enough to notice
   * that the last note has gone. Nothing is animated here anyway: the highlight
   * moves once per note, not once per frame.
   */
  const follow = useCallback(() => {
    const schedule = scheduleRef.current;
    const matcher = matcherRef.current;
    const elapsed = outputRef.current?.elapsed();

    if (!schedule || !matcher || elapsed === null || elapsed === undefined) {
      stopPlayback();
      return;
    }

    const due = stepAtTime(schedule, elapsed);
    // Only ever forward: seeking skips rests, so the engine can already stand
    // past the step that is sounding.
    if (due !== null && due > matcher.progress.stepIndex) {
      matcher.seekToStep(due);
      advanceCursor();
      scrollCursorIntoView(osmdRef.current, scrollRef.current, "auto");
      setTick((t) => t + 1);
    }

    if (elapsed >= schedule.duration + PLAYBACK_TAIL_SECONDS) stopPlayback();
  }, [advanceCursor, stopPlayback]);

  // The audio hardware outlives every piece, so it is only given back when the
  // app itself goes away.
  useEffect(() => {
    return () => {
      if (followRef.current !== null) clearInterval(followRef.current);
      outputRef.current?.dispose();
      outputRef.current = null;
    };
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

  /** Leaves the score, keeping the bar it stood on for the way back. */
  const goHome = useCallback(() => {
    stopPlayback();
    const step = matcherRef.current?.progress.stepIndex;
    resumeStepRef.current = step === undefined ? null : { key: selected.key, step };
    setSheet(null);
    setResumable(true);
    setView("home");
  }, [selected.key, stopPlayback]);

  /**
   * A card on the home screen opens the score with the matching panel already
   * up, because picking the mode and picking within it is one decision. The
   * piece behind is the one from last time, so closing the panel without
   * choosing still leaves something to play.
   */
  const openMode = useCallback((mode: ModeId) => {
    setSheet(mode === "pieces" ? "pieces" : "exercise");
    setView("practice");
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

        const next = clamp(osmd.zoom * factor, ZOOM_MIN, ZOOM_FIT_MAX);
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

  // Load and render whenever the piece changes — and again after a detour to
  // the home screen, which unmounts the host the renderer draws into.
  useEffect(() => {
    if (view !== "practice") return;

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

    /*
     * Three kinds of source, one loader.
     *
     * A bundled piece is a URL OSMD fetches itself, one of the user's own is a
     * Blob out of storage, and an exercise is MusicXML generated on the spot.
     * `load` takes all three, which is exactly why the generator writes XML
     * rather than feeding the engine directly — from here on nothing can tell
     * a generated scale from a file off disk.
     */
    const source: Promise<string | Blob> =
      selected.kind === "bundled"
        ? Promise.resolve(selected.url)
        : selected.kind === "exercise"
          ? Promise.resolve(exerciseToMusicXml(buildExercise(selected.options)))
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

        const matcher = new NoteMatcher(extracted);

        // Same piece as before the home screen: carry on where it stood.
        const resumeAt = resumeStepRef.current;
        resumeStepRef.current = null;
        if (resumeAt && resumeAt.key === selected.key) matcher.seekToStep(resumeAt.step);

        matcherRef.current = matcher;
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
      // The schedule belongs to the score that is going away.
      stopPlayback();
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
  }, [selected, view]);

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
      advanceCursor();
      scrollCursorIntoView(osmd, scrollRef.current, "smooth");
    }
    setTick((t) => t + 1);
  }, [advanceCursor]);

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
    stopPlayback();
    matcherRef.current?.reset();
    restoreCursor();
    scrollCursorIntoView(osmdRef.current, scrollRef.current, "auto");
    setTick((t) => t + 1);
  }, [restoreCursor, stopPlayback]);

  const jumpToMeasure = useCallback(
    (measure: number) => {
      stopPlayback();
      matcherRef.current?.seekToMeasure(measure);
      restoreCursor();
      scrollCursorIntoView(osmdRef.current, scrollRef.current, "smooth");
      setSheet(null);
      setTick((t) => t + 1);
    },
    [restoreCursor, stopPlayback],
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

      stopPlayback();

      const box = svg.getBoundingClientRect();
      if (box.width <= 0) return;

      const fraction = (e.clientX - box.left) / box.width;
      matcher.seekToStep(stepAtFraction(anchorsRef.current, fraction));

      restoreCursor();
      scrollCursorIntoView(osmdRef.current, scrollRef.current, "smooth");
      setTick((t) => t + 1);
    },
    [restoreCursor, stopPlayback],
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
  const audioSupported = isAudioSupported();
  const playing = playback !== "idle";
  /**
   * The tempo in force where the highlight stands, so the setting can name
   * what its percentages are a share of. It is not one number per piece: the
   * C major prelude broadens from 72 to 30 for its last two bars.
   */
  const currentBpm = score
    ? (score.steps[progress?.stepIndex ?? 0]?.bpm ?? score.steps[0]?.bpm)
    : undefined;

  function setZoomManually(next: number) {
    setAutoFit(false);
    setZoom(round(clamp(next, ZOOM_MIN, ZOOM_MAX)));
  }

  /**
   * Plays from where the highlight stands, and stops on a second press.
   *
   * The engine's position is both where it starts and where it ends up, so
   * listening to a passage leaves you ready to play the next one — rather
   * than somewhere a separate playback marker happened to stop.
   */
  async function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }

    const matcher = matcherRef.current;
    if (!score || !matcher) return;

    const schedule = buildSchedule(score, matcher.progress.stepIndex, tempoFactor);
    if (schedule.notes.length === 0) return;

    // Built on the first press rather than on mount: a browser hands out sound
    // only from inside a gesture, and iOS is strict about it.
    const output = (outputRef.current ??= new SampledPiano());

    scheduleRef.current = schedule;
    setAudioError(null);
    setPlayback("loading");

    try {
      await output.start(schedule.notes);
    } catch (e: unknown) {
      stopPlayback();
      setAudioError(describeError(e));
      return;
    }

    // The press may have been taken back while the recordings were still
    // coming in, in which case the output quietly declined to start.
    if (output.elapsed() === null) return;

    setPlayback("playing");
    follow();
    followRef.current = setInterval(follow, FOLLOW_MS);
  }

  /** Changing the speed mid-passage would need a new schedule; simpler to stop. */
  function changeTempo(factor: number) {
    stopPlayback();
    setTempoFactor(factor);
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

  /** Builds the drafted exercise and opens it. */
  function startExercise() {
    choosePiece(exerciseSelection({ ...draft, fingerings }));
    setSheet(null);
  }

  /**
   * Turning fingerings on or off has to regenerate an open exercise, because
   * the numbers are baked into its notation rather than layered over it.
   */
  function changeFingerings(next: boolean) {
    setFingerings(next);
    if (selected.kind === "exercise") {
      choosePiece(exerciseSelection({ ...selected.options, fingerings: next }));
    }
  }

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

  if (view === "home") {
    return (
      <div className="app">
        <Home
          resume={resumable ? selected.label : null}
          onResume={() => setView("practice")}
          onPick={openMode}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-button" onClick={goHome} aria-label="Zur Startseite">
          ←
        </button>

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
      {audioError && <pre className="error-box">{audioError}</pre>}

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
        <button
          className="secondary"
          onClick={restart}
          aria-label="Von vorn"
          disabled={busy || playing}
        >
          ↺
        </button>
        {/*
          Hearing the passage, rather than being told which notes it holds.
          Naming them would turn reading notation into reading text; playing
          them gives the ear something to aim at and still leaves the eyes the
          work of finding it on the page.
        */}
        <button
          className={"secondary" + (playing ? " on" : "")}
          onClick={togglePlay}
          aria-label={
            playback === "playing"
              ? "Wiedergabe anhalten"
              : playback === "loading"
                ? "Klänge werden geladen"
                : "Ab hier vorspielen"
          }
          disabled={busy || !audioSupported}
        >
          {playback === "playing" ? "■" : playback === "loading" ? "…" : "▶"}
        </button>
        <button
          className="primary"
          onClick={playCorrect}
          disabled={busy || playing || progress?.finished}
        >
          richtigen Ton spielen
        </button>
        <button
          className="secondary"
          onClick={playWrong}
          aria-label="Falschen Ton spielen"
          disabled={busy || playing || progress?.finished}
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

              <button className="add-file" onClick={() => setSheet("exercise")}>
                <span>Tonleiter oder Übung erzeugen</span>
              </button>

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

          {sheet === "exercise" && (
            <div className="sheet" role="dialog" aria-label="Übung erzeugen">
              <h2>Übung</h2>

              <div className="field">
                <span>Art</span>
                <div className="choices">
                  {KIND_LABELS.map(([kind, label]) => (
                    <button
                      key={kind}
                      className={draft.kind === kind ? "current" : ""}
                      onClick={() => setDraft((d) => ({ ...d, kind }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Dur</span>
                <div className="keys">
                  {MAJOR_KEYS.map(([tonic, alter]) => {
                    const key = keyOf(tonic, alter, "major");
                    return (
                      <button
                        key={key.tonic + key.tonicAlter}
                        className={sameKey(draft.key, key) ? "current" : ""}
                        onClick={() => setDraft((d) => ({ ...d, key }))}
                      >
                        {keyName(key)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field">
                <span>Moll, harmonisch</span>
                <div className="keys">
                  {MINOR_KEYS.map(([tonic, alter]) => {
                    const key = keyOf(tonic, alter, "harmonicMinor");
                    return (
                      <button
                        key={`m${key.tonic}${key.tonicAlter}`}
                        className={sameKey(draft.key, key) ? "current" : ""}
                        onClick={() => setDraft((d) => ({ ...d, key }))}
                      >
                        {keyName(key)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {draft.kind !== "fiveFinger" && (
                <div className="field">
                  <span>Oktaven</span>
                  <div className="stepper">
                    <button
                      onClick={() => setDraft((d) => ({ ...d, octaves: d.octaves - 1 }))}
                      disabled={draft.octaves <= 1}
                      aria-label="Weniger"
                    >
                      −
                    </button>
                    <output>{draft.octaves}</output>
                    <button
                      onClick={() => setDraft((d) => ({ ...d, octaves: d.octaves + 1 }))}
                      disabled={draft.octaves >= 4}
                      aria-label="Mehr"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              <div className="field">
                <span>Bewegung</span>
                <div className="choices">
                  <button
                    className={draft.motion === "parallel" ? "current" : ""}
                    onClick={() => setDraft((d) => ({ ...d, motion: "parallel" }))}
                  >
                    Parallel
                  </button>
                  <button
                    className={draft.motion === "contrary" ? "current" : ""}
                    onClick={() => setDraft((d) => ({ ...d, motion: "contrary" }))}
                  >
                    Gegenbewegung
                  </button>
                </div>
              </div>

              {fingerings && draft.key.mode !== "major" && (
                <p className="hint">
                  Für Moll gibt es noch keine Fingersätze — die Noten stimmen, die
                  Zahlen fehlen. Lieber keine als falsche.
                </p>
              )}

              <button className="close" onClick={startExercise}>
                {buildExercise({ ...draft, fingerings }).title} öffnen
              </button>
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

              <label className="row-toggle">
                Fingersätze über den Noten
                <input
                  type="checkbox"
                  checked={fingerings}
                  onChange={(e) => changeFingerings(e.target.checked)}
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

              <div className="field">
                <span>Tempo beim Vorspielen</span>
                <div className="choices">
                  {TEMPO_FACTORS.map(([factor, label]) => (
                    <button
                      key={label}
                      className={tempoFactor === factor ? "current" : ""}
                      onClick={() => changeTempo(factor)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  {audioSupported
                    ? currentBpm
                      ? `Bezogen auf das Tempo der Noten — hier gerade ${Math.round(currentBpm)} Viertel pro Minute.`
                      : "Bezogen auf das Tempo, das in den Noten steht."
                    : "Dieser Browser kann keinen Ton ausgeben."}
                </p>
                <p className="hint">
                  Klang: Salamander Grand Piano von Alexander Holm, CC-BY 3.0.
                  Die Aufnahmen liegen in der App und werden beim ersten
                  Vorspielen geladen.
                </p>
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

/** Two keys are the same when tonic, accidental and mode all match. */
function sameKey(a: Key, b: Key): boolean {
  return a.tonic === b.tonic && a.tonicAlter === b.tonicAlter && a.mode === b.mode;
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

/**
 * Reopens the piece from last time, and reports whether there was one — the
 * home screen offers it as a card, and must not offer a piece nobody picked.
 */
function restoreLastPiece(
  available: Selection[],
  select: (piece: Selection) => void,
): boolean {
  let key: string | null = null;
  try {
    key = localStorage.getItem(LAST_PIECE_KEY);
  } catch {
    return false;
  }
  if (!key) return false;

  const found = available.find((p) => p.key === key);
  if (found) {
    select(found);
    return true;
  }

  // An exercise is not in the list — it is described entirely by its key and
  // simply generated again.
  const exercise = parseExerciseKey(key);
  if (exercise) {
    select(exercise);
    return true;
  }

  // Otherwise the piece was deleted since, and the default stands.
  return false;
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
