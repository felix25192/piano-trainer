import { Sheet } from "./Sheet";
import { TEMPO_FACTORS } from "./usePlayback";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "./useScoreView";

interface Props {
  autoFit: boolean;
  onAutoFit: (on: boolean) => void;
  fingerings: boolean;
  onFingerings: (on: boolean) => void;
  zoom: number;
  /** Setting the size by hand, which switches the automatic fit off. */
  onZoom: (zoom: number) => void;
  /** The keyboards MIDI reports, null while it is off; undefined where there is no Web MIDI. */
  midiDevices: string[] | null | undefined;
  /** Shown only where a microphone can be opened at all. */
  protocol: { on: boolean; switch: (on: boolean) => void } | null;
  tempoFactor: number;
  onTempo: (factor: number) => void;
  audioSupported: boolean;
  /**
   * The tempo in force where the highlight stands, so the setting can name
   * what its percentages are a share of. It is not one number per piece: the
   * C major prelude broadens from 72 to 30 for its last two bars.
   */
  currentBpm: number | undefined;
  onClose: () => void;
}

export function SettingsSheet(props: Props) {
  const { autoFit, fingerings, zoom, midiDevices, protocol, tempoFactor, currentBpm } = props;

  return (
    <Sheet label="Einstellungen" title="Einstellungen" onClose={props.onClose}>
      <label className="row-toggle">
        An die Bildschirmhöhe anpassen
        <input type="checkbox" checked={autoFit} onChange={(e) => props.onAutoFit(e.target.checked)} />
      </label>

      <label className="row-toggle">
        Fingersätze über den Noten
        <input
          type="checkbox"
          checked={fingerings}
          onChange={(e) => props.onFingerings(e.target.checked)}
        />
      </label>

      <div className="field">
        <span>Notengröße</span>
        <div className="stepper">
          <button
            onClick={() => props.onZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Kleiner"
          >
            −
          </button>
          <output>{zoom.toFixed(1)}×</output>
          <button
            onClick={() => props.onZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Größer"
          >
            +
          </button>
        </div>
        <p className="hint">Von Hand einstellen schaltet die automatische Anpassung ab.</p>
      </div>

      {midiDevices !== undefined && (
        <div className="field">
          <span>MIDI</span>
          <p className="hint">
            {midiDevices === null
              ? "Aus. Das Keyboard einschalten, per USB verbinden und unten auf „MIDI“ tippen."
              : `An: ${midiDevices.length ? midiDevices.join(", ") : "kein Gerät verbunden"}. Beide Hände zugleich, ohne Mikrofon.`}
          </p>
        </div>
      )}

      {protocol && (
        <div className="field">
          <label className="row-toggle">
            Anschlagsprotokoll
            <input
              type="checkbox"
              checked={protocol.on}
              onChange={(e) => protocol.switch(e.target.checked)}
            />
          </label>
          <p className="hint">
            Zeigt unter den Noten, was das Mikrofon bei jedem Anschlag gehört
            hat — und dafür auch die erwarteten Töne. Zur Fehlersuche am
            Instrument, nicht zum Üben.
          </p>
        </div>
      )}

      <div className="field">
        <span>Tempo beim Vorspielen</span>
        <div className="choices">
          {TEMPO_FACTORS.map(([factor, label]) => (
            <button
              key={label}
              className={tempoFactor === factor ? "current" : ""}
              onClick={() => props.onTempo(factor)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hint">
          {props.audioSupported
            ? currentBpm
              ? `Bezogen auf das Tempo der Noten — hier gerade ${Math.round(currentBpm)} Viertel pro Minute.`
              : "Bezogen auf das Tempo, das in den Noten steht."
            : "Dieser Browser kann keinen Ton ausgeben."}
        </p>
        <p className="hint">
          Klang: Salamander Grand Piano von Alexander Holm, CC-BY 3.0. Die
          Aufnahmen liegen in der App und werden beim ersten Vorspielen geladen.
        </p>
      </div>

      <button className="close" onClick={props.onClose}>Fertig</button>
    </Sheet>
  );
}
