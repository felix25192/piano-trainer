import { useState } from "react";
import { Sheet } from "./Sheet";
import type { Take } from "./useInputs";
import { minutes } from "./format";
import { TEMPO_FACTORS } from "./usePlayback";
import { TEMPO_MAX, TEMPO_MIN, TEMPO_STEP } from "./useTempoRun";
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
  /** Recording for the test round; null where there is no microphone. */
  recording: {
    on: boolean;
    switch: (on: boolean) => void;
    takes: Take[];
    hasLog: boolean;
    copyLog: () => Promise<boolean>;
  } | null;
  /** True while the microphone listens: the recording switch waits until it stops. */
  listening: boolean;
  onShare: (take: Take) => void;
  tempoFactor: number;
  onTempo: (factor: number) => void;
  /** Quarters per minute for a run in tempo. */
  runBpm: number;
  onRunBpm: (bpm: number) => void;
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
  const { autoFit, fingerings, zoom, midiDevices, protocol, recording, tempoFactor, currentBpm } = props;
  /** What became of the last press of "copy", shown until the panel closes. */
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);

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
          {recording && (
            <button
              className="add-file"
              disabled={!recording.hasLog}
              onClick={async () => setCopied((await recording.copyLog()) ? "done" : "failed")}
            >
              <span>
                {copied === "done"
                  ? "Protokoll kopiert"
                  : copied === "failed"
                    ? "Kopieren ging nicht"
                    : "Protokoll der letzten Sitzung kopieren"}
              </span>
            </button>
          )}
        </div>
      )}

      {recording && (
        <div className="field">
          <label className="row-toggle">
            Mitschnitt für die Testrunde
            <input
              type="checkbox"
              checked={recording.on}
              disabled={props.listening}
              onChange={(e) => recording.switch(e.target.checked)}
            />
          </label>
          <p className="hint">
            {props.listening
              ? "Lässt sich umstellen, sobald das Mikrofon aus ist: Eine Sitzung wird ganz aufgenommen oder gar nicht."
              : "Solange das Mikrofon zuhört, wird aufgenommen, was es hört, mit dem ganzen Protokoll dazu. Ist dabei ein MIDI-Keyboard angeschlossen, schreibt es nur mit. Alles bleibt auf diesem Gerät, bis du es teilst."}
          </p>
          {recording.takes.length > 0 && (
            <ul className="takes">
              {recording.takes.map((take) => (
                <li key={take.id}>
                  <span>
                    {minutes(take.seconds)} · {(take.wav.byteLength / 1e6).toFixed(1)} MB
                  </span>
                  <button onClick={() => props.onShare(take)}>Teilen</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="field">
        <span>Tempo beim Spielen im Tempo</span>
        <div className="stepper">
          <button
            onClick={() => props.onRunBpm(props.runBpm - TEMPO_STEP)}
            disabled={props.runBpm <= TEMPO_MIN}
            aria-label="Langsamer"
          >
            −
          </button>
          <output>{props.runBpm}</output>
          <button
            onClick={() => props.onRunBpm(props.runBpm + TEMPO_STEP)}
            disabled={props.runBpm >= TEMPO_MAX}
            aria-label="Schneller"
          >
            +
          </button>
        </div>
        <p className="hint">
          Viertel pro Minute, dort wo der Durchlauf beginnt. Wechselt das Stück
          das Tempo, bleibt das Verhältnis. Die notierten Tempi sind für den
          Vortrag gedacht, nicht zum Lesen vom Blatt.
        </p>
      </div>

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
