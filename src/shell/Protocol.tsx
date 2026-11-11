import type { Heard, Refusal } from "../core/hearing";
import { keyLabel } from "../core/pitch";
import type { ProtocolEntry } from "./useInputs";

const REFUSALS: Record<Refusal, string> = {
  "no-pitch": "keine Tonhöhe",
  unclear: "unklar",
  "between-keys": "zwischen zwei Tasten",
  "off-keyboard": "außerhalb der Tastatur",
};

/** How a line is coloured: as the engine will take it. */
function verdictOf(heard: Heard, expected: number[]): string {
  if (heard.midi === null) return "refused";
  return expected.includes(heard.midi) ? "right" : "wrong";
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
