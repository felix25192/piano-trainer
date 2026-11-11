import { buildExercise, exerciseKey, parseExerciseKey, type ExerciseOptions } from "./core/exercises";
import type { LibraryEntry } from "./adapters/scoreLibrary";

/**
 * What can be opened: the pieces that ship with the app, the user's own files,
 * and generated exercises — and which of them was open last.
 */

/**
 * A piece comes either with the app or from the user's own files. Both end up
 * as something OSMD can load — a URL or a Blob — but they are told apart here
 * so the piece list can offer a delete for one and not the other.
 */
export type Selection =
  | { kind: "bundled"; key: string; label: string; url: string; hint?: string }
  | { kind: "library"; key: string; label: string; id: string; hint?: string }
  | { kind: "exercise"; key: string; label: string; options: ExerciseOptions; hint?: string };

/**
 * An exercise is described entirely by its options, so its key can carry them.
 *
 * That is what lets the last one be reopened after a reload: there is nothing
 * stored anywhere, the exercise is simply generated again from its name.
 */
export function exerciseSelection(options: ExerciseOptions): Selection {
  return {
    kind: "exercise",
    // The fingering setting is part of the key too: flipping it has to
    // produce a different selection, or the score would not be regenerated.
    key: exerciseKey(options),
    label: buildExercise(options).title,
    options,
  };
}

export function librarySelection(entry: LibraryEntry): Selection {
  return { kind: "library", key: `lib:${entry.id}`, label: entry.title, id: entry.id };
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
export const BUNDLED: Selection[] = [
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

const LAST_PIECE_KEY = "piano-trainer.lastPiece";

/**
 * Which piece was open last.
 *
 * localStorage is right for this and wrong for the scores themselves: it holds
 * one short string, and losing it costs nothing more than a tap. Every access
 * is guarded because it throws outright in a private window or with site data
 * blocked.
 */
export function rememberLastPiece(key: string): void {
  try {
    localStorage.setItem(LAST_PIECE_KEY, key);
  } catch {
    // Storage unavailable. The app works, it just forgets.
  }
}

/**
 * The piece from last time, or null when there is none to offer — the home
 * screen shows it as a card, and must not offer a piece nobody picked.
 */
export function lastPiece(available: Selection[]): Selection | null {
  let key: string | null = null;
  try {
    key = localStorage.getItem(LAST_PIECE_KEY);
  } catch {
    return null;
  }
  if (!key) return null;

  const found = available.find((p) => p.key === key);
  if (found) return found;

  // An exercise is not in the list — it is described entirely by its key and
  // simply generated again.
  const options = parseExerciseKey(key);
  if (options) return exerciseSelection(options);

  // Otherwise the piece was deleted since, and the default stands.
  return null;
}
