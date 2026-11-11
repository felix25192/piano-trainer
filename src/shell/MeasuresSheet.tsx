import { Sheet } from "./Sheet";

interface Props {
  /** Only measures that hold something to play — see `playableMeasures`. */
  measures: number[];
  current: number | null;
  onJump: (measure: number) => void;
  onClose: () => void;
}

export function MeasuresSheet({ measures, current, onJump, onClose }: Props) {
  return (
    <Sheet label="Takt wählen" title="Takt" onClose={onClose}>
      <div className="measures">
        {measures.map((number) => (
          <button
            key={number}
            className={number === current ? "current" : ""}
            onClick={() => onJump(number)}
          >
            {number}
          </button>
        ))}
      </div>

      <p className="hint">
        Schneller geht es, indem du direkt ins Notenbild tippst — dort landest
        du auf der Note statt am Taktanfang.
      </p>

      <button className="close" onClick={onClose}>Fertig</button>
    </Sheet>
  );
}
