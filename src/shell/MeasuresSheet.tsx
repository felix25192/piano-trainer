import { useState } from "react";
import { Sheet } from "./Sheet";

interface Props {
  /** Only measures that hold something to play — see `playableMeasures`. */
  measures: number[];
  current: number | null;
  loop: { from: number; to: number } | null;
  onJump: (measure: number) => void;
  /** Repeats bars `from` to `to`, in the order they were tapped. */
  onLoop: (from: number, to: number) => void;
  onClearLoop: () => void;
  onClose: () => void;
}

/**
 * The bars of the piece: tap one to go there, or pick two to loop between.
 *
 * Picking a loop is a mode of its own rather than a second kind of tap, so
 * that a tap always does one thing: outside the mode it jumps, inside it marks
 * the first and then the last bar. The same bar twice loops just that bar.
 */
export function MeasuresSheet({ measures, current, loop, onJump, onLoop, onClearLoop, onClose }: Props) {
  /** Null while bars are jumped to; otherwise the first bar picked so far, if any. */
  const [picking, setPicking] = useState<{ from: number | null } | null>(null);

  function tap(measure: number) {
    if (!picking) {
      onJump(measure);
    } else if (picking.from === null) {
      setPicking({ from: measure });
    } else {
      onLoop(picking.from, measure);
      setPicking(null);
    }
  }

  function classOf(measure: number): string {
    const classes: string[] = [];
    if (measure === current) classes.push("current");
    if (picking ? measure === picking.from : loop && measure >= loop.from && measure <= loop.to) {
      classes.push("in-loop");
    }
    return classes.join(" ");
  }

  return (
    <Sheet label="Takt wählen" title="Takt" onClose={onClose}>
      <div className="loop-row">
        {picking ? (
          <p className="hint">
            {picking.from === null
              ? "Ersten Takt der Schleife antippen."
              : `Ab Takt ${picking.from} — jetzt den letzten antippen. Derselbe noch einmal wiederholt nur diesen.`}
          </p>
        ) : loop ? (
          <>
            <span>
              Schleife: Takt {loop.from === loop.to ? loop.from : `${loop.from} bis ${loop.to}`}
            </span>
            <button onClick={() => setPicking({ from: null })}>Ändern</button>
            <button onClick={onClearLoop}>Aufheben</button>
          </>
        ) : (
          <button onClick={() => setPicking({ from: null })}>↻ Schleife wählen</button>
        )}
      </div>

      <div className="measures">
        {measures.map((number) => (
          <button key={number} className={classOf(number)} onClick={() => tap(number)}>
            {number}
          </button>
        ))}
      </div>

      {!picking && (
        <p className="hint">
          Schneller geht es, indem du direkt ins Notenbild tippst — dort landest
          du auf der Note statt am Taktanfang.
        </p>
      )}

      <button className="close" onClick={picking ? () => setPicking(null) : onClose}>
        {picking ? "Abbrechen" : "Fertig"}
      </button>
    </Sheet>
  );
}
