import type { PlaybackState } from "./usePlayback";

interface Props {
  /** A score is loading or failed to. */
  busy: boolean;
  finished: boolean;
  playback: PlaybackState;
  audioSupported: boolean;
  mic: { supported: boolean; on: boolean; toggle: () => void };
  midi: { supported: boolean; devices: string[] | null; toggle: () => void };
  onRestart: () => void;
  onPlay: () => void;
  onNext: () => void;
}

/**
 * The bar under the score.
 *
 * While practising the screen is hardly touched — both hands are on the keys
 * and the instrument drives the app. So the instruments get the room here, with
 * their names on them, and everything else is a single symbol.
 */
export function ActionBar({ busy, finished, playback, audioSupported, mic, midi, ...on }: Props) {
  const playing = playback !== "idle";
  const midiOn = midi.devices !== null;
  const midiLabel = midi.devices?.length ? midi.devices.join(", ") : "kein Gerät verbunden";

  return (
    <div className="actions">
      <button className="secondary" onClick={on.onRestart} aria-label="Von vorn" disabled={busy || playing}>
        ↺
      </button>

      {/*
        Hearing the passage, rather than being told which notes it holds.
        Naming them would turn reading notation into reading text; playing them
        gives the ear something to aim at and still leaves the eyes the work of
        finding it on the page.
      */}
      <button
        className={"secondary" + (playing ? " on" : "")}
        onClick={on.onPlay}
        aria-label={
          playback === "playing"
            ? "Wiedergabe anhalten"
            : playback === "loading"
              ? "Klänge werden geladen"
              : "Ab hier vorspielen"
        }
        disabled={busy || !audioSupported}
      >
        {playback === "playing" ? "■" : playback === "loading" ? "…" : "▶"}
      </button>

      {/*
        The microphone: one note at a time for now, so one hand at a time.
        Greyed out while a passage plays, since the two cannot both hold the
        device.
      */}
      {mic.supported && (
        <button
          className={"input" + (mic.on ? " on" : "")}
          onClick={mic.toggle}
          aria-pressed={mic.on}
          aria-label={mic.on ? "Mikrofon ausschalten" : "Mit dem Mikrofon spielen"}
          disabled={busy || playing}
        >
          <svg viewBox="0 0 24 24" className="glyph" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
            <path d="M12 18v3" />
          </svg>
          <span>Mikrofon</span>
        </button>
      )}

      {/*
        A keyboard over a cable: exact, and both hands at once. Only where the
        browser has Web MIDI at all, so never in Safari.
      */}
      {midi.supported && (
        <button
          className={"input" + (midiOn ? " on" : "")}
          onClick={midi.toggle}
          aria-pressed={midiOn}
          aria-label={midiOn ? `MIDI ausschalten (${midiLabel})` : "Mit MIDI-Keyboard spielen"}
          title={midiOn ? `MIDI: ${midiLabel}` : "Mit MIDI-Keyboard spielen"}
          disabled={busy}
        >
          {/* Four white keys F G A B, so the three black ones are right. */}
          <svg viewBox="0 0 24 24" className="glyph" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7.5 13v6M12 13v6M16.5 13v6" />
            <rect x="6.2" y="5" width="2.6" height="8" fill="currentColor" />
            <rect x="10.7" y="5" width="2.6" height="8" fill="currentColor" />
            <rect x="15.2" y="5" width="2.6" height="8" fill="currentColor" />
          </svg>
          <span>MIDI</span>
        </button>
      )}

      {/*
        Reading along without an instrument: name the notes in your head, then
        move on. Same as the space bar, and it moves past a whole chord at once.
      */}
      <button
        className="secondary"
        onClick={on.onNext}
        aria-label="Weiter, ohne zu spielen"
        title="Weiter (Leertaste)"
        disabled={busy || playing || finished}
      >
        →
      </button>
    </div>
  );
}
