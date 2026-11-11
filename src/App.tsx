import { useEffect, useRef, useState } from "react";
import { playableMeasures, type Hands } from "./core/score";
import { keyOf } from "./core/theory";
import { isAudioSupported } from "./adapters/audioSession";
import Home, { type ModeId } from "./Home";
import { exerciseSelection } from "./pieces";
import { ActionBar } from "./shell/ActionBar";
import { ExerciseSheet, type Draft } from "./shell/ExerciseSheet";
import { clamp, round } from "./shell/format";
import { MeasuresSheet } from "./shell/MeasuresSheet";
import { PiecesSheet } from "./shell/PiecesSheet";
import { Protocol } from "./shell/Protocol";
import { ScoreArea } from "./shell/ScoreArea";
import { SettingsSheet } from "./shell/SettingsSheet";
import { TopBar } from "./shell/TopBar";
import { useInputs } from "./shell/useInputs";
import { usePieces } from "./shell/usePieces";
import { usePlayback } from "./shell/usePlayback";
import { useScoreView, ZOOM_MAX, ZOOM_MIN, type Resume } from "./shell/useScoreView";
import "./App.css";

/**
 * The shell. It connects the parts and decides nothing itself.
 *
 * Laid out for a tablet or phone held in landscape on a music stand. While
 * practising the screen is hardly touched — both hands are on the keys and the
 * instrument drives the app — so the score gets the room and the controls stay
 * out of the way.
 *
 * What decides lives in src/core and is tested there. What touches the browser
 * lives in src/adapters. src/shell holds the hooks that keep state — the score
 * and the place in it, playback, the instruments, the pieces — and the
 * components that draw them. This file hands each what the others offer: a
 * played note, from whichever instrument, goes to `practice.play`; the sound
 * reaching a step goes to `practice.follow`. Every rule about what may run at
 * once is written where it is enforced, beside the thing it protects.
 */

/**
 * Home screen or score — the app only ever shows one of the two.
 *
 * Nothing about the score survives a detour to the home screen: OSMD is torn
 * down with it and the piece is parsed again on the way back. That costs a
 * moment, and it keeps the teardown honest: the alternative is a hidden
 * renderer kept alive, fitting itself to a container that is no longer on
 * screen.
 */
type Screen = "home" | "practice";

/** Which panel is open over the score, if any. */
type SheetId = "pieces" | "measures" | "settings" | "exercise";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [sheet, setSheet] = useState<SheetId | null>(null);
  /** Set once the score was left for the home screen, which then offers the way back. */
  const [wentHome, setWentHome] = useState(false);
  const [zoom, setZoom] = useState(1.2);
  const [autoFit, setAutoFit] = useState(true);
  const [fingerings, setFingerings] = useState(true);
  const [tempoFactor, setTempoFactor] = useState(1);
  const [draft, setDraft] = useState<Draft>({
    kind: "scale",
    key: keyOf("C", 0, "major"),
    octaves: 2,
    motion: "parallel",
  });
  const resumeRef = useRef<Resume | null>(null);

  const pieces = usePieces();
  const practice = useScoreView({
    selection: pieces.selected,
    active: screen === "practice",
    zoom,
    autoFit,
    onFit: setZoom,
    resume: resumeRef,
  });
  const playback = usePlayback({
    score: practice.score,
    tempoFactor,
    from: practice.at,
    onReach: practice.follow,
  });
  const inputs = useInputs({
    onNote: practice.play,
    expected: practice.remaining,
    playingBack: playback.isActive,
    beforeListening: () => {
      playback.stop();
      playback.clearError();
    },
  });

  // The space bar moves on like the next button, for reading along at a desk.
  const { next } = practice;
  const { isActive: playingBack } = playback;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!playingBack()) next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, playingBack]);

  const { score, progress } = practice;
  const busy = practice.status !== "bereit";
  const finished = progress?.finished ?? false;
  const playing = playback.state !== "idle";

  /** Leaves the score, keeping the bar it stood on for the way back. */
  function goHome() {
    playback.stop();
    // The microphone holds the device's audio and is given back; MIDI holds
    // nothing and stays, since whoever sits at the keyboard changes pieces,
    // not instruments.
    inputs.mic.stop();
    resumeRef.current = progress ? { key: pieces.selected.key, step: practice.at() } : null;
    setSheet(null);
    setWentHome(true);
    setScreen("home");
  }

  /**
   * A card on the home screen opens the score with the matching panel already
   * up, because picking the mode and picking within it is one decision. The
   * piece behind is the one from last time, so closing the panel without
   * choosing still leaves something to play.
   */
  function openMode(mode: ModeId) {
    setSheet(mode === "pieces" ? "pieces" : "exercise");
    setScreen("practice");
  }

  function togglePlay() {
    // The two cannot both hold the device, so asking to hear the passage
    // means giving up listening for it.
    if (!playing) inputs.mic.stop();
    void playback.toggle();
  }

  // Every way of moving the position by hand stops a passage that is playing:
  // the highlight cannot follow the sound and the hand at once.
  function restart() {
    playback.stop();
    practice.reset();
  }

  function changeHands(next: Hands) {
    playback.stop();
    practice.changeHands(next);
  }

  function jumpToMeasure(measure: number) {
    playback.stop();
    practice.seekToMeasure(measure);
    setSheet(null);
  }

  function tap(clientX: number) {
    playback.stop();
    practice.seekAt(clientX);
  }

  /** Changing the speed mid-passage would need a new schedule; simpler to stop. */
  function changeTempo(factor: number) {
    playback.stop();
    setTempoFactor(factor);
  }

  function setZoomManually(next: number) {
    setAutoFit(false);
    setZoom(round(clamp(next, ZOOM_MIN, ZOOM_MAX)));
  }

  /** Builds the drafted exercise and opens it. */
  function startExercise() {
    pieces.choose(exerciseSelection({ ...draft, fingerings }));
    setSheet(null);
  }

  /**
   * Turning fingerings on or off has to regenerate an open exercise, because
   * the numbers are baked into its notation rather than layered over it.
   */
  function changeFingerings(next: boolean) {
    setFingerings(next);
    const selected = pieces.selected;
    if (selected.kind === "exercise") {
      pieces.choose(exerciseSelection({ ...selected.options, fingerings: next }));
    }
  }

  if (screen === "home") {
    return (
      <div className="app">
        <Home
          resume={pieces.restored || wentHome ? pieces.selected.label : null}
          onResume={() => setScreen("practice")}
          onPick={openMode}
        />
      </div>
    );
  }

  const errors = [practice.error, playback.error, inputs.mic.error, inputs.midi.error];
  const close = () => setSheet(null);

  return (
    <div className="app">
      <TopBar
        pieceLabel={pieces.selected.label}
        measure={progress && !progress.finished ? progress.measure : null}
        hands={practice.hands}
        ready={score !== null}
        status={busy ? practice.status : finished ? "zu Ende" : ""}
        onHome={goHome}
        onPieces={() => setSheet("pieces")}
        onMeasures={() => setSheet("measures")}
        onHands={changeHands}
        onSettings={() => setSheet("settings")}
      />

      {errors.map((error, i) => error && <pre key={i} className="error-box">{error}</pre>)}

      {inputs.midi.devices?.length === 0 && (
        <p className="notice">
          Das MIDI-Gerät ist getrennt. Sobald es wieder eingeschaltet und verbunden ist, geht es weiter.
        </p>
      )}
      {/*
        Both hands sounding together are a chord, and the microphone hears one
        note at a time for now. Without this the highlight would simply stay
        put on the first chord, and only the home screen would say why.
      */}
      {inputs.mic.on && practice.hands === "both" && (
        <p className="notice">
          Das Mikrofon hört bisher einen Ton zur Zeit, also eine Hand. Oben „rechte Hand“ oder
          „linke Hand“ wählen.
        </p>
      )}

      <ScoreArea
        hostRef={practice.hostRef}
        viewportRef={practice.viewportRef}
        wrong={progress?.hasError ?? false}
        misses={practice.misses}
        onTap={tap}
      />

      <ActionBar
        busy={busy}
        finished={finished}
        playback={playback.state}
        audioSupported={isAudioSupported()}
        mic={inputs.mic}
        midi={inputs.midi}
        onRestart={restart}
        onPlay={togglePlay}
        onNext={practice.next}
      />

      {inputs.protocol.on && <Protocol entries={inputs.protocol.entries} listening={inputs.mic.on} />}

      {sheet === "pieces" && (
        <PiecesSheet
          pieces={pieces.all}
          library={pieces.library}
          selectedKey={pieces.selected.key}
          error={pieces.error}
          onChoose={pieces.choose}
          onAddFiles={pieces.addFiles}
          onRemove={pieces.remove}
          onExercise={() => setSheet("exercise")}
          onClose={close}
        />
      )}

      {sheet === "measures" && (
        <MeasuresSheet
          measures={score ? playableMeasures(score, practice.hands) : []}
          current={progress?.measure ?? null}
          onJump={jumpToMeasure}
          onClose={close}
        />
      )}

      {sheet === "exercise" && (
        <ExerciseSheet
          draft={draft}
          onDraft={setDraft}
          fingerings={fingerings}
          onOpen={startExercise}
          onClose={close}
        />
      )}

      {sheet === "settings" && (
        <SettingsSheet
          autoFit={autoFit}
          onAutoFit={setAutoFit}
          fingerings={fingerings}
          onFingerings={changeFingerings}
          zoom={zoom}
          onZoom={setZoomManually}
          midiDevices={inputs.midi.supported ? inputs.midi.devices : undefined}
          protocol={inputs.mic.supported ? inputs.protocol : null}
          tempoFactor={tempoFactor}
          onTempo={changeTempo}
          audioSupported={isAudioSupported()}
          currentBpm={
            score ? (score.steps[progress?.stepIndex ?? 0]?.bpm ?? score.steps[0]?.bpm) : undefined
          }
          onClose={close}
        />
      )}
    </div>
  );
}
