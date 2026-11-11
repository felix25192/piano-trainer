import type { Heard, Refusal } from "./hearing";
import { keyLabel } from "./pitch";

/**
 * What happened while the microphone listened: every strike it noticed and
 * what was expected then, and — when a MIDI keyboard was connected as a
 * witness — every key that went down or up and every move of the pedal.
 *
 * Kept for a whole session rather than the four lines the strip under the
 * score shows, and written out as text to paste into a conversation. That
 * turns a round at the instrument into data instead of tallies.
 */

/**
 * A key going down or up, or the sustain pedal moving, with its time on the
 * page's clock. MIDI reports these; the engine never sees them.
 */
export type KeyEvent =
  | { kind: "down" | "up"; midi: number; velocity: number; time: number }
  | { kind: "pedal"; down: boolean; time: number };

/** Where in the piece the engine stood. */
export interface Where {
  measure: number;
  step: number;
}

/** One line of the log. `at` is in seconds since listening began, like `Heard.struckAt`. */
export type LogEntry =
  | { kind: "heard"; at: number; heard: Heard; expected: number[]; where: Where | null }
  | { kind: "key"; at: number; event: KeyEvent };

export const REFUSALS: Record<Refusal, string> = {
  "no-pitch": "keine Tonhöhe",
  unclear: "unklar",
  "between-keys": "zwischen zwei Tasten",
  "off-keyboard": "außerhalb der Tastatur",
};

/** How the engine will take a strike: as expected, as a mistake, or not at all. */
export function verdictOf(heard: Heard, expected: number[]): "right" | "wrong" | "refused" {
  if (heard.midi === null) return "refused";
  return expected.includes(heard.midi) ? "right" : "wrong";
}

const VERDICTS = { right: "richtig", wrong: "falsch", refused: "verworfen" } as const;

/**
 * The log as text, one line per strike or key, in the order they happened,
 * after a few lines saying where and on what it was recorded.
 *
 * Seconds come first and with two decimals, so that a microphone line and the
 * MIDI line of the same key sit next to each other and their difference can
 * be read off: that difference is how late the microphone stamps a strike.
 */
export function formatLog(entries: LogEntry[], header: string[]): string {
  const lines = [...header, ""];
  const ordered = [...entries].sort((a, b) => a.at - b.at);

  for (const entry of ordered) {
    const t = `${entry.at.toFixed(2)} s`;

    if (entry.kind === "key") {
      const e = entry.event;
      lines.push(
        e.kind === "pedal"
          ? `${t}  MIDI Pedal ${e.down ? "↓" : "↑"}`
          : `${t}  MIDI ${e.kind === "down" ? "↓" : "↑"} ${keyLabel(e.midi)}${e.kind === "down" ? ` (${e.velocity})` : ""}`,
      );
      continue;
    }

    const { heard, expected, where } = entry;
    const verdict = verdictOf(heard, expected);
    const parts = [
      t,
      where ? `T. ${where.measure}` : "",
      heard.midi === null ? `nichts (${REFUSALS[heard.refused ?? "no-pitch"]})` : `gehört ${keyLabel(heard.midi)}`,
      `erwartet ${expected.length ? expected.map(keyLabel).join(" ") : "–"}`,
      VERDICTS[verdict],
      `${heard.by === "loudness" ? "Pegel" : "Spektrum"} ${heard.level.toFixed(3)} · Fluss ${heard.flux.toFixed(1)}`,
      heard.clarity === null ? "" : `Klarheit ${heard.clarity.toFixed(2)}`,
      heard.cents === null ? "" : `${heard.cents > 0 ? "+" : ""}${heard.cents} ct`,
    ];
    lines.push(parts.filter(Boolean).join("  "));
  }
  return lines.join("\n");
}
