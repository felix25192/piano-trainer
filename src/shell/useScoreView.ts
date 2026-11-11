import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { NoteMatcher, type MatcherProgress } from "../core/NoteMatcher";
import { buildExercise } from "../core/exercises";
import { exerciseToMusicXml } from "../core/musicxml";
import type { Hands, Score } from "../core/score";
import { ScoreView, type Mark } from "../adapters/osmdScore";
import { getScoreBlob } from "../adapters/scoreLibrary";
import type { Selection } from "../pieces";
import { describeError, round } from "./format";

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;

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
export const ZOOM_FIT_MAX = 2;

export type LoadStatus = "lädt" | "bereit" | "fehlgeschlagen";

/**
 * Where practice stood when the home screen was opened.
 *
 * Going home throws the engine away with the renderer, so the step is kept
 * and sought back to once the same piece has been parsed again. Without it a
 * card that says "weiter üben" would drop you at bar one.
 */
export interface Resume {
  key: string;
  step: number;
  /** The bars being looped, which come back with the place. */
  loop: { from: number; to: number } | null;
}

interface Options {
  selection: Selection;
  /** False while the home screen is up; the score's elements are not mounted then. */
  active: boolean;
  zoom: number;
  autoFit: boolean;
  /** Reports the size the automatic fit settled on, so the settings can show it. */
  onFit: (zoom: number) => void;
  /** A place to return to, taken by the next load of the same piece. */
  resume: RefObject<Resume | null>;
}

/**
 * The score on screen and the place in it.
 *
 * Loads a piece into the view, builds the engine for it, and keeps the
 * highlight where the engine stands. Every move below goes through the matcher
 * first and then shows where it stands, so the two cannot drift apart.
 */
export function useScoreView({ selection, active, zoom, autoFit, onFit, resume }: Options) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ScoreView | null>(null);
  const matcherRef = useRef<NoteMatcher | null>(null);

  const [score, setScore] = useState<Score | null>(null);
  const [status, setStatus] = useState<LoadStatus>("lädt");
  const [error, setError] = useState<string | null>(null);
  /**
   * Which hands the engine asks for. Hands separately is how a piece is
   * learnt, and it is also the only way the microphone can follow: both hands
   * sounding together are a chord. Kept across pieces, since it is a way of
   * practising and not a property of one score.
   */
  const [hands, setHands] = useState<Hands>("both");
  /** Counts wrong notes, so the highlight can nudge at each one and not only the first. */
  const [misses, setMisses] = useState(0);
  /**
   * Where the engine stands, as of its last move. The engine itself lives in a
   * ref, since it changes on every note; this copy is what the screen draws.
   */
  const [progress, setProgress] = useState<MatcherProgress | null>(null);
  const sync = useCallback(() => setProgress(matcherRef.current?.progress ?? null), []);

  // Read at load time only. Changing them must not parse the file again, so
  // they reach the load through refs and drive their own effects instead.
  const handsRef = useRef(hands);
  const zoomRef = useRef(zoom);
  const autoFitRef = useRef(autoFit);
  const onFitRef = useRef(onFit);
  // Before the load effect below, so a load always reads this render's values.
  useEffect(() => {
    handsRef.current = hands;
    zoomRef.current = zoom;
    autoFitRef.current = autoFit;
    onFitRef.current = onFit;
  });

  /** The step the engine waits on. */
  const at = useCallback(() => matcherRef.current?.progress.stepIndex ?? 0, []);

  const showHere = useCallback(
    (behavior: ScrollBehavior) => viewRef.current?.show(at(), behavior),
    [at],
  );

  /** Fits the engraving to the height and puts the highlight back. */
  const fit = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    onFitRef.current(round(view.fitHeight(ZOOM_MIN, ZOOM_FIT_MAX)));
    showHere("auto");
  }, [showHere]);

  // Load and render whenever the piece changes — and again after a detour to
  // the home screen, which unmounts the host the renderer draws into.
  useEffect(() => {
    const host = hostRef.current;
    const viewport = viewportRef.current;
    if (!active || !host || !viewport) return;

    let cancelled = false;
    setError(null);
    setStatus("lädt");
    setScore(null);
    matcherRef.current = null;
    setProgress(null);

    const view = new ScoreView(host, viewport);
    viewRef.current = view;

    /*
     * Three kinds of source, one loader.
     *
     * A bundled piece is a URL OSMD fetches itself, one of the user's own is a
     * Blob out of storage, and an exercise is MusicXML generated on the spot.
     * The view takes all three, which is exactly why the generator writes XML
     * rather than feeding the engine directly — from here on nothing can tell
     * a generated scale from a file off disk.
     */
    const source: Promise<string | Blob> =
      selection.kind === "bundled"
        ? Promise.resolve(selection.url)
        : selection.kind === "exercise"
          ? Promise.resolve(exerciseToMusicXml(buildExercise(selection.options)))
          : getScoreBlob(selection.id).then((blob) => {
              if (!blob) throw new Error("Diese Datei liegt nicht mehr im Speicher.");
              return blob;
            });

    source
      .then((content) => view.load(content, selection.label, zoomRef.current))
      .then((loaded) => {
        if (cancelled || !loaded) return;

        const matcher = new NoteMatcher(loaded, { hands: handsRef.current });

        // Same piece as before the home screen: carry on where it stood, in
        // the same loop. The loop first, since setting one moves to its start.
        const back = resume.current;
        resume.current = null;
        if (back && back.key === selection.key) {
          if (back.loop) matcher.setLoop(back.loop.from, back.loop.to);
          matcher.seekToStep(back.step);
        }

        matcherRef.current = matcher;
        setScore(loaded);
        setStatus("bereit");

        if (autoFitRef.current) fit();
        else showHere("auto");
        sync();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(describeError(e));
        setStatus("fehlgeschlagen");
      });

    return () => {
      cancelled = true;
      view.dispose();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [selection, active, resume, fit, showHere, sync]);

  // Manual zoom: engrave again without parsing again.
  useEffect(() => {
    if (!score || autoFit) return;
    if (viewRef.current?.setZoom(zoom)) showHere("auto");
  }, [zoom, score, autoFit, showHere]);

  // The tint over the looped bars follows the loop, and comes back with a
  // new view after a load.
  const loopFrom = progress?.loop?.from ?? null;
  const loopTo = progress?.loop?.to ?? null;
  useEffect(() => {
    if (!score) return;
    const bars = loopFrom !== null && loopTo !== null ? { from: loopFrom, to: loopTo } : null;
    viewRef.current?.markLoop(bars);
  }, [loopFrom, loopTo, score]);

  // Fit again when the viewport changes — rotating the device is the main case.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !score || !autoFit) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(viewport);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [score, autoFit, fit]);

  /** The single entry point for played notes — from an instrument or the next button. */
  const play = useCallback(
    (midi: number) => {
      const matcher = matcherRef.current;
      if (!matcher || !viewRef.current) return;

      const outcome = matcher.noteOn({ midi, time: performance.now(), confidence: 1 });
      if (outcome.kind === "advanced") showHere("smooth");
      if (outcome.kind === "wrong") setMisses((n) => n + 1);
      sync();
    },
    [showHere, sync],
  );

  /**
   * Moves on as if the whole step had been played: reading along without an
   * instrument, naming the notes in your head. Through `play`, so it takes the
   * same path as every key.
   */
  const next = useCallback(() => {
    for (const midi of matcherRef.current?.remaining ?? []) play(midi);
  }, [play]);

  /** Puts the position on a step: a tap, or the place a passage played back has reached. */
  const seek = useCallback(
    (step: number, behavior: ScrollBehavior = "smooth") => {
      const matcher = matcherRef.current;
      if (!matcher) return;
      matcher.seekToStep(step);
      showHere(behavior);
      sync();
    },
    [showHere, sync],
  );

  /**
   * Keeps up with a passage being played back. Only ever forward: seeking
   * skips rests, so the engine can already stand past the step that is
   * sounding.
   */
  const follow = useCallback(
    (step: number) => {
      if (step > at()) seek(step, "auto");
    },
    [at, seek],
  );

  /** A tap in the score starts from there. Practising means repeating one awkward bar. */
  const seekAt = useCallback(
    (clientX: number) => {
      const step = viewRef.current?.stepAt(clientX);
      if (step !== null && step !== undefined) seek(step);
    },
    [seek],
  );

  const seekToMeasure = useCallback(
    (measure: number) => {
      matcherRef.current?.seekToMeasure(measure);
      showHere("smooth");
      sync();
    },
    [showHere, sync],
  );

  const reset = useCallback(() => {
    matcherRef.current?.reset();
    showHere("auto");
    sync();
  }, [showHere, sync]);

  /** Asks for other hands from here on, keeping the place. */
  const changeHands = useCallback(
    (next: Hands) => {
      setHands(next);
      matcherRef.current?.setHands(next);
      showHere("smooth");
      sync();
    },
    [showHere, sync],
  );

  /** Repeats a span of bars and goes to its start. False when the span holds nothing. */
  const setLoop = useCallback(
    (from: number, to: number): boolean => {
      if (!matcherRef.current?.setLoop(from, to)) return false;
      showHere("smooth");
      sync();
      return true;
    },
    [showHere, sync],
  );

  /** Lets the piece run on again, keeping the place. */
  const clearLoop = useCallback(() => {
    matcherRef.current?.clearLoop();
    sync();
  }, [sync]);

  /**
   * Back to the start of the loop, if there is one. Where a passage played to
   * the end of the loop leaves you, so that what was just heard is what comes
   * next.
   */
  const toLoopStart = useCallback(() => {
    const matcher = matcherRef.current;
    if (!matcher?.progress.loop) return;
    matcher.reset();
    showHere("smooth");
    sync();
  }, [showHere, sync]);

  /** Puts the signs of a run in tempo above the steps, or clears them with null. */
  const markSteps = useCallback((marks: ReadonlyMap<number, Mark> | null) => {
    viewRef.current?.markSteps(marks);
  }, []);

  /** Where a passage played back from here stops; null for the end of the piece. */
  const passageEnd = useCallback(() => matcherRef.current?.passageEnd ?? null, []);

  /** What the engine waits for now — for the strike protocol, never for display. */
  const remaining = useCallback(() => matcherRef.current?.remaining ?? [], []);

  return {
    hostRef,
    viewportRef,
    score,
    status,
    error,
    hands,
    progress,
    misses,
    at,
    remaining,
    play,
    next,
    seek,
    seekAt,
    follow,
    seekToMeasure,
    reset,
    changeHands,
    setLoop,
    clearLoop,
    toLoopStart,
    passageEnd,
    markSteps,
  };
}
