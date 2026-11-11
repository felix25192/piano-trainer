import type { Heard } from "../core/hearing";
import { keyLabel } from "../core/pitch";
import { REFUSALS, verdictOf } from "../core/sessionLog";

/** A line of the strip: what was heard, and what was wanted then. */
export interface ProtocolEntry {
  heard: Heard;
  expected: number[];
}

/**
 * The strike protocol: a strip under the score listing what the microphone
 * made of each strike, what was expected, and the numbers behind it.
 *
 * For finding out at the instrument why the highlight is stuck, not for
 * practising — it names the expected notes, which the app otherwise never does.
 */
export function Protocol({ entries, listening }: { entries: ProtocolEntry[]; listening: boolean }) {
  return (
    <ol className="protocol" aria-label="Anschlagsprotokoll">
      {entries.length === 0 && (
        <li className="muted">{listening ? "Noch kein Anschlag gehört." : "Mikrofon ist aus."}</li>
      )}
      {entries.map(({ heard, expected }) => (
        <li key={heard.struckAt} className={verdictOf(heard, expected)}>
          <span>{heard.struckAt.toFixed(2)} s</span>
          <span>{heard.midi === null ? REFUSALS[heard.refused ?? "no-pitch"] : keyLabel(heard.midi)}</span>
          <span>erwartet {expected.length ? expected.map(keyLabel).join(" ") : "–"}</span>
          <span>
            {heard.by === "loudness" ? "Pegel" : "Spektrum"} {heard.level.toFixed(3)} · {heard.flux.toFixed(1)}
          </span>
          <span>
            {heard.clarity === null ? "" : `Klarheit ${heard.clarity.toFixed(2)}`}
            {heard.cents === null ? "" : ` · ${heard.cents > 0 ? "+" : ""}${heard.cents} ct`}
          </span>
        </li>
      ))}
    </ol>
  );
}
