import type { Hands } from "../core/score";

const HANDS_LABELS: Record<Hands, string> = {
  both: "beide Hände",
  right: "rechte Hand",
  left: "linke Hand",
};

const NEXT_HANDS: Record<Hands, Hands> = { both: "right", right: "left", left: "both" };

interface Props {
  pieceLabel: string;
  /** The measure the highlight stands in, or null when there is none. */
  measure: number | null;
  /** The bars being looped, if any. */
  loop: { from: number; to: number } | null;
  hands: Hands;
  /** Whether a score is loaded and can be navigated. */
  ready: boolean;
  /** Loading, failed, or finished — never the notes. */
  status: string;
  onHome: () => void;
  onPieces: () => void;
  onMeasures: () => void;
  onHands: (next: Hands) => void;
  onSettings: () => void;
}

/** Piece, measure and hands: what you change while practising, one tap away. */
export function TopBar(props: Props) {
  const { pieceLabel, measure, loop, hands, ready, status } = props;

  return (
    <header className="topbar">
      <button className="icon-button" onClick={props.onHome} aria-label="Zur Startseite">
        ←
      </button>

      <button className="piece" onClick={props.onPieces}>
        <span className="label">{pieceLabel}</span>
        <span className="caret">▾</span>
      </button>

      <button className="measure" onClick={props.onMeasures} disabled={!ready}>
        Takt {measure ?? "—"}
        <span className="caret">▾</span>
      </button>

      {/* While a loop is set it says so here, and a tap leads to where it is changed. */}
      {loop && (
        <button
          className="loop"
          onClick={props.onMeasures}
          aria-label={`Schleife über Takt ${loop.from} bis ${loop.to}, tippen zum Ändern`}
        >
          ↻ {loop.from === loop.to ? loop.from : `${loop.from}–${loop.to}`}
        </button>
      )}

      {/*
        One tap cycles through the three. Hands separately gets switched back
        and forth all the time while a passage is being learnt, so it sits here
        with piece and measure rather than in the settings.
      */}
      <button
        className="hands"
        onClick={() => props.onHands(NEXT_HANDS[hands])}
        aria-label={`${HANDS_LABELS[hands]}, tippen für ${HANDS_LABELS[NEXT_HANDS[hands]]}`}
        disabled={!ready}
      >
        {HANDS_LABELS[hands]}
      </button>

      {/*
        The expected notes are deliberately NOT shown. Naming them turns the
        exercise into reading text instead of reading notation, which is the
        whole point of the app. The highlight marks a mistake without giving
        the answer away.
      */}
      <span className="expect">{status}</span>

      <button className="icon-button" onClick={props.onSettings} aria-label="Einstellungen">
        ⚙
      </button>
    </header>
  );
}
