import { useEffect, useRef, useState } from "react";
import { playableMeasures, type Hands } from "./core/score";
import { keyOf } from "./core/theory";
import { isAudioSupported } from "./adapters/audioSession";
import Home, { type ModeId } from "./Home";
import { exerciseSelection } from "./pieces";
import { ActionBar } from "./shell/ActionBar";
import { ExerciseSheet, type Draft } from "./shell/ExerciseSheet";
import { clamp, minutes, round } from "./shell/format";
import { shareFiles } from "./shell/share";
import { MeasuresSheet } from "./shell/MeasuresSheet";
import { PiecesSheet } from "./shell/PiecesSheet";
import { Protocol } from "./shell/Protocol";
import { ScoreArea } from "./shell/ScoreArea";
import { SettingsSheet } from "./shell/SettingsSheet";
import { TopBar } from "./shell/TopBar";
import { useInputs, type Take } from "./shell/useInputs";
import { usePieces } from "./shell/usePieces";
import { usePlayback } from "./shell/usePlayback";
import { useScoreView, ZOOM_MAX, ZOOM_MIN, type Resume } from "./shell/useScoreView";
import { TEMPO_DEFAULT, TEMPO_MAX, TEMPO_MIN, useTempoRun } from "./shell/useTempoRun";
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
  /** Quarters per minute for a run in tempo. */
  const [runBpm, setRunBpm] = useState(TEMPO_DEFAULT);
  /** The newest recording already offered for sharing, so the offer is made once. */
  const [offeredTake, setOfferedTake] = useState(0);
  /** Why a run in tempo did not start, until the next try. */
  const [runNotice, setRunNotice] = useState<string | null>(null);
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
    // Inside a loop a passage plays to the loop's end, and the place then goes
    // back to its start: what was just heard is what is played next.
    until: practice.passageEnd,
    onReach: practice.follow,
    onEnd: (atLoopEnd) => {
      if (atLoopEnd) practice.toLoopStart();
    },
  });
  const tempo = useTempoRun({
    score: practice.score,
    hands: practice.hands,
    bpm: runBpm,
    from: practice.at,
    // In a loop, one pass and then stop, so the marks can be looked at.
    until: practice.passageEnd,
    onReach: practice.follow,
    // The next try starts where this one did, with the marks before it.
    onEnd: (startStep) => practice.seek(startStep),
    markSteps: practice.markSteps,
  });
  const inputs = useInputs({
    // During a run the clock decides, not the matcher: notes go to the run,
    // with the time they were struck.
    onNote: (note) => (tempo.isActive() ? tempo.noteOn(note) : practice.play(note.midi)),
    expected: practice.remaining,
    where: () => {
      const step = practice.score?.steps[practice.at()];
      return step ? { measure: step.measure, step: step.index } : null;
    },
    describe: () => [
      `Stück: ${pieces.selected.label}`,
      `Hände: ${{ both: "beide", right: "rechts", left: "links" }[practice.hands]}`,
    ],
    playingBack: playback.isActive,
    beforeListening: () => {
      playback.stop();
      playback.clearError();
    },
  });

  // The space bar moves on like the next button, for reading along at a desk.
  const { next } = practice;
  const { isActive: playingBack } = playback;
  const { isActive: running } = tempo;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!playingBack() && !running()) next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, playingBack, running]);

  const { score, progress } = practice;
  const busy = practice.status !== "bereit";
  const finished = progress?.finished ?? false;
  const playing = playback.state !== "idle";

  /** Leaves the score, keeping the bar it stood on for the way back. */
  function goHome() {
    playback.stop();
    tempo.stop();
    // The microphone holds the device's audio and is given back; MIDI holds
    // nothing and stays, since whoever sits at the keyboard changes pieces,
    // not instruments.
    inputs.mic.stop();
    resumeRef.current = progress
      ? { key: pieces.selected.key, step: practice.at(), loop: progress.loop }
      : null;
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

  /**
   * Starts a run in tempo, or stops the one going.
   *
   * Not without an instrument: with neither the microphone nor MIDI on, every
   * step would come out missed, and that says nothing about the reading.
   */
  function toggleRun() {
    if (tempo.isActive()) {
      tempo.stop();
      return;
    }
    if (!inputs.mic.on && inputs.midi.devices === null) {
      setRunNotice("Für einen Durchlauf im Tempo zuerst das Mikrofon oder MIDI einschalten.");
      return;
    }
    setRunNotice(null);
    playback.stop();
    tempo.start();
  }

  function togglePlay() {
    // The two cannot both hold the device, so asking to hear the passage
    // means giving up listening for it.
    if (!playing) inputs.mic.stop();
    void playback.toggle();
  }

  // Every way of moving the position by hand stops whatever moves it by the
  // clock — a passage playing, or a run: the highlight cannot follow both.
  function stopClocks() {
    playback.stop();
    tempo.stop();
  }

  function restart() {
    stopClocks();
    practice.reset();
  }

  function changeHands(next: Hands) {
    stopClocks();
    practice.changeHands(next);
  }

  function jumpToMeasure(measure: number) {
    stopClocks();
    practice.seekToMeasure(measure);
    setSheet(null);
  }

  function setLoop(from: number, to: number) {
    stopClocks();
    practice.setLoop(from, to);
    setSheet(null);
  }

  /** A tap moves the position, and takes the marks of the last run away. */
  function tap(clientX: number) {
    stopClocks();
    tempo.clearMarks();
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
  const newTake = inputs.recording.takes[inputs.recording.takes.length - 1];

  /** Offers a recording to the share sheet: the sound and the log beside it. */
  function shareTake(take: Take) {
    setOfferedTake((seen) => Math.max(seen, take.id));
    void shareFiles(
      [
        new File([take.wav], `${take.name}.wav`, { type: "audio/wav" }),
        new File([take.json], `${take.name}.json`, { type: "application/json" }),
      ],
      take.name,
    );
  }
  const runningNow = tempo.state !== "idle";
  const close = () => setSheet(null);

  return (
    <div className="app">
      <TopBar
        pieceLabel={pieces.selected.label}
        measure={progress && !progress.finished ? progress.measure : null}
        loop={progress?.loop ?? null}
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

      {runNotice && !runningNow && <p className="notice">{runNotice}</p>}

      {/* A recording that just ended, offered once; the settings keep the rest. */}
      {newTake && newTake.id > offeredTake && !inputs.mic.on && (
        <div className="notice take">
          <span>Mitschnitt fertig: {minutes(newTake.seconds)}.</span>
          <button onClick={() => shareTake(newTake)}>Teilen</button>
          <button onClick={() => setOfferedTake(newTake.id)}>Später</button>
        </div>
      )}

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
        tempo={{ running: runningNow, bpm: runBpm, beat: tempo.beat, toggle: toggleRun }}
        onRestart={restart}
        onPlay={togglePlay}
        onNext={practice.next}
      />

      {/*
        The count-in, large enough to read from the keyboard. Keyed by the
        beat, so each number appears afresh and not as an edit of the last.
      */}
      {tempo.beat?.counting && (
        <div className="count-in" key={tempo.beat.serial} aria-live="assertive">
          {tempo.beat.number}
        </div>
      )}

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
          loop={progress?.loop ?? null}
          onJump={jumpToMeasure}
          onLoop={setLoop}
          onClearLoop={practice.clearLoop}
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
          recording={inputs.mic.supported ? inputs.recording : null}
          listening={inputs.mic.on}
          onShare={shareTake}
          tempoFactor={tempoFactor}
          onTempo={changeTempo}
          runBpm={runBpm}
          onRunBpm={(bpm) => setRunBpm(clamp(bpm, TEMPO_MIN, TEMPO_MAX))}
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
