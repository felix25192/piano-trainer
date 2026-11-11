import {
  buildExercise,
  keyName,
  MAJOR_KEYS,
  MINOR_KEYS,
  type ExerciseOptions,
} from "../core/exercises";
import { sameKey, type Key } from "../core/theory";
import { Sheet } from "./Sheet";

/** What the exercise builder has set. Fingerings live in the settings instead. */
export type Draft = Omit<ExerciseOptions, "fingerings">;

const KIND_LABELS: Array<[ExerciseOptions["kind"], string]> = [
  ["scale", "Tonleiter"],
  ["arpeggio", "Arpeggio"],
  ["fiveFinger", "Fünf Finger"],
];

interface Props {
  draft: Draft;
  onDraft: (change: (draft: Draft) => Draft) => void;
  fingerings: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function ExerciseSheet({ draft, onDraft, fingerings, onOpen, onClose }: Props) {
  const keyButton = (key: Key) => (
    <button
      key={`${key.mode}${key.tonic}${key.tonicAlter}`}
      className={sameKey(draft.key, key) ? "current" : ""}
      onClick={() => onDraft((d) => ({ ...d, key }))}
    >
      {keyName(key)}
    </button>
  );

  return (
    <Sheet label="Übung erzeugen" title="Übung" onClose={onClose}>
      <div className="field">
        <span>Art</span>
        <div className="choices">
          {KIND_LABELS.map(([kind, label]) => (
            <button
              key={kind}
              className={draft.kind === kind ? "current" : ""}
              onClick={() => onDraft((d) => ({ ...d, kind }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Dur</span>
        <div className="keys">{MAJOR_KEYS.map(keyButton)}</div>
      </div>

      <div className="field">
        <span>Moll, harmonisch</span>
        <div className="keys">{MINOR_KEYS.map(keyButton)}</div>
      </div>

      {draft.kind !== "fiveFinger" && (
        <div className="field">
          <span>Oktaven</span>
          <div className="stepper">
            <button
              onClick={() => onDraft((d) => ({ ...d, octaves: d.octaves - 1 }))}
              disabled={draft.octaves <= 1}
              aria-label="Weniger"
            >
              −
            </button>
            <output>{draft.octaves}</output>
            <button
              onClick={() => onDraft((d) => ({ ...d, octaves: d.octaves + 1 }))}
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
            onClick={() => onDraft((d) => ({ ...d, motion: "parallel" }))}
          >
            Parallel
          </button>
          <button
            className={draft.motion === "contrary" ? "current" : ""}
            onClick={() => onDraft((d) => ({ ...d, motion: "contrary" }))}
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

      <button className="close" onClick={onOpen}>
        {buildExercise({ ...draft, fingerings }).title} öffnen
      </button>
    </Sheet>
  );
}
