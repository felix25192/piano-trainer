import type { ReactNode } from "react";

/**
 * A panel that slides over the score, with a backdrop that closes it.
 *
 * Pieces and measures get one each, reachable by tapping what they show in the
 * top bar. Both are things you change *while* practising, so routing them
 * through a settings menu would be a detour taken dozens of times an hour.
 */
export function Sheet({
  label,
  title,
  onClose,
  children,
}: {
  label: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button className="backdrop" onClick={onClose} aria-label="Schließen" />
      <div className="sheet" role="dialog" aria-label={label}>
        <h2>{title}</h2>
        {children}
      </div>
    </>
  );
}
