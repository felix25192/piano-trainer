import { useRef, type RefObject } from "react";

interface Props {
  hostRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  /** A wrong note stands. */
  wrong: boolean;
  /** How many wrong notes so far; its parity restarts the nudge. See App.css. */
  misses: number;
  /** A tap, as opposed to a swipe, at this point on screen. */
  onTap: (clientX: number) => void;
}

/**
 * The scrolling strip the engraving is drawn into.
 *
 * A tap in it starts from there — practising means repeating one awkward bar,
 * not the opening. Scrolling the score is a swipe and must not move the
 * position, so only a gesture that stayed put counts as aiming at a note.
 */
export function ScoreArea({ hostRef, viewportRef, wrong, misses, onTap }: Props) {
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={"scroller" + (wrong ? ` wrong nudge-${misses % 2}` : "")}
      ref={viewportRef}
      onPointerDown={(e) => {
        pressRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const press = pressRef.current;
        pressRef.current = null;
        if (!press) return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) return;
        onTap(e.clientX);
      }}
      onPointerCancel={() => {
        pressRef.current = null;
      }}
    >
      <div ref={hostRef} />
    </div>
  );
}
