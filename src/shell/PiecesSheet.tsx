import type { ChangeEvent } from "react";
import { scoreFileAccept } from "../core/scoreFile";
import { isLibrarySupported, type LibraryEntry } from "../adapters/scoreLibrary";
import type { Selection } from "../pieces";
import { formatSize } from "./format";
import { Sheet } from "./Sheet";

interface Props {
  pieces: Selection[];
  library: LibraryEntry[];
  selectedKey: string;
  error: string | null;
  onChoose: (piece: Selection) => void;
  /** Stores the files and opens the first; resolves to whether any arrived. */
  onAddFiles: (files: File[]) => Promise<boolean>;
  onRemove: (entry: LibraryEntry) => void;
  onExercise: () => void;
  onClose: () => void;
}

/** The piece list: the bundled set, the user's own files, and a way to generate one. */
export function PiecesSheet(props: Props) {
  const { pieces, library, selectedKey, error, onClose } = props;

  async function onFilesPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    // Clearing the input means picking the same file twice in a row still
    // fires a change event.
    event.target.value = "";
    if (files.length === 0) return;
    if (await props.onAddFiles(files)) onClose();
  }

  function remove(entry: LibraryEntry) {
    if (!window.confirm(`„${entry.title}" entfernen?`)) return;
    props.onRemove(entry);
  }

  return (
    <Sheet label="Stück wählen" title="Stück" onClose={onClose}>
      <ul className="pieces">
        {pieces.map((piece) => {
          const entry =
            piece.kind === "library" ? library.find((e) => e.id === piece.id) : undefined;
          return (
            <li key={piece.key} className={piece.key === selectedKey ? "current" : ""}>
              <button
                className="pick"
                onClick={() => {
                  props.onChoose(piece);
                  onClose();
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
                  onClick={() => remove(entry)}
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

      {error && <p className="warn">{error}</p>}

      <p className="hint">
        MusicXML als .mxl, .musicxml oder .xml. Die Dateien bleiben auf diesem
        Gerät und werden nirgendwohin geschickt.
      </p>

      <button className="add-file" onClick={props.onExercise}>
        <span>Tonleiter oder Übung erzeugen</span>
      </button>

      <button className="close" onClick={onClose}>Fertig</button>
    </Sheet>
  );
}
