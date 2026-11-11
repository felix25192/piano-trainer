import { useCallback, useEffect, useState } from "react";
import {
  addScore,
  isLibrarySupported,
  listScores,
  removeScore,
  type LibraryEntry,
} from "../adapters/scoreLibrary";
import { BUNDLED, lastPiece, librarySelection, rememberLastPiece, type Selection } from "../pieces";
import { describeError } from "./format";

/**
 * Which piece is open, which others could be, and the user's own files.
 */
export function usePieces() {
  const [selected, setSelected] = useState<Selection>(BUNDLED[0]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Whether the piece from last time was found, for the home screen's card. */
  const [restored, setRestored] = useState(false);

  // Pieces the user brought along, read once on start. The piece that was open
  // last is reopened with them, so sitting down at the piano and reloading
  // does not mean hunting for it again.
  useEffect(() => {
    function restore(available: Selection[]) {
      const last = lastPiece(available);
      if (!last) return;
      setSelected(last);
      setRestored(true);
    }

    if (!isLibrarySupported()) {
      restore(BUNDLED);
      return;
    }
    listScores()
      .then((entries) => {
        setLibrary(entries);
        restore([...BUNDLED, ...entries.map(librarySelection)]);
      })
      .catch((e: unknown) => setError(describeError(e)));
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
  const choose = useCallback((piece: Selection) => {
    setSelected(piece);
    rememberLastPiece(piece.key);
  }, []);

  /** Stores files in the library and opens the first. Reports whether any arrived. */
  const addFiles = useCallback(
    async (files: File[]): Promise<boolean> => {
      setError(null);
      const added: LibraryEntry[] = [];

      for (const file of files) {
        try {
          added.push(await addScore(file));
        } catch (e: unknown) {
          setError(describeError(e));
        }
      }

      if (added.length === 0) return false;
      setLibrary((prev) => [...added, ...prev]);
      // Open the first new piece straight away — that is why it was added.
      choose(librarySelection(added[0]));
      return true;
    },
    [choose],
  );

  const remove = useCallback(
    async (entry: LibraryEntry) => {
      try {
        await removeScore(entry.id);
      } catch (e: unknown) {
        setError(describeError(e));
        return;
      }

      setLibrary((prev) => prev.filter((e) => e.id !== entry.id));
      if (selected.kind === "library" && selected.id === entry.id) choose(BUNDLED[0]);
    },
    [selected, choose],
  );

  return {
    selected,
    choose,
    /** Everything that can be opened from the list, bundled first. */
    all: [...BUNDLED, ...library.map(librarySelection)],
    library,
    error,
    restored,
    addFiles,
    remove,
  };
}
