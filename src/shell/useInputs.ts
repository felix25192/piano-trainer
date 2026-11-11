import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayedNote } from "../core/NoteInputSource";
import { formatLog, type LogEntry, type Where } from "../core/sessionLog";
import { Stitcher } from "../core/stitch";
import { encodeWav } from "../core/wav";
import { MicInput } from "../adapters/MicInput";
import { MidiInput } from "../adapters/MidiInput";
import { describeError } from "./format";
import type { ProtocolEntry } from "./Protocol";

/** Enough to see a pattern across a few notes without taking the score's height. */
const PROTOCOL_LINES = 4;

/**
 * How many recordings are kept. Each holds about six megabytes a minute, and
 * they live only in memory until they are shared; the oldest goes first.
 */
const TAKES_KEPT = 12;

/** One listening session, recorded: the sound as WAV and the log beside it. */
export interface Take {
  /** Counts up through the session, so a new take can be told from one already offered. */
  id: number;
  name: string;
  seconds: number;
  wav: ArrayBuffer;
  json: string;
}

interface Options {
  /** Where every played note goes, with the time of its strike. */
  onNote: (note: PlayedNote) => void;
  /** What the engine waits for, for the protocol. */
  expected: () => number[];
  /** Where the engine stands, for the log. */
  where: () => Where | null;
  /** A line or two about what is being practised, for the head of the log. */
  describe: () => string[];
  /** True while a passage plays back. Keys pressed then are ignored. */
  playingBack: () => boolean;
  /** Called before the microphone opens: playback has to give up the device first. */
  beforeListening: () => void;
}

/** What one listening session is writing down. */
interface Session {
  began: Date;
  /** When listening began, on the page's clock; MIDI times are counted from here. */
  since: number;
  /** Null when the session is not being recorded. */
  stitcher: Stitcher | null;
}

/**
 * The instruments: the microphone and a MIDI keyboard.
 *
 * Both hand every note to the same `onNote`, which is the whole point of the
 * `NoteInputSource` port: from there down nothing can tell an inferred pitch
 * from a key press over a cable, or from the next button.
 *
 * One drives the engine at a time. Played on the Kawai with the microphone
 * open, every note would arrive twice: over the cable, and a tenth of a second
 * later out of the piano's own speakers — by then judged against the next
 * note, and marked wrong. So each switches the other off.
 *
 * With one exception, decided on 11.11.2026: while a session is being
 * recorded, MIDI may stay connected as a witness. It then writes every key
 * and the pedal into the log and hands nothing to the engine, so nothing is
 * counted twice — and the log shows, key by key, how late the microphone
 * stamps a strike.
 */
export function useInputs(options: Options) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  /** The microphone, built on the first tap and kept afterwards. */
  const micRef = useRef<MicInput | null>(null);
  const unlistenMicRef = useRef<(() => void) | null>(null);
  /** The MIDI keyboard, built on the first tap and kept afterwards. */
  const midiRef = useRef<MidiInput | null>(null);
  const unlistenMidiRef = useRef<(() => void) | null>(null);

  /**
   * Whether the microphone is driving the engine.
   *
   * Never true at the same time as playback: the device has one audio
   * session and the two need different categories — see core/audioMode.
   */
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  const [micError, setMicError] = useState<string | null>(null);
  /**
   * The keyboards MIDI reports, or null while MIDI is off.
   *
   * Empty while on means the keyboard went away — switched off, or the cable
   * pulled — and it is picked up again as soon as it returns.
   */
  const [midiDevices, setMidiDevices] = useState<string[] | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);

  /**
   * Whether the next listening session is recorded. Read when the
   * microphone opens, and not changeable while it listens, so a session is
   * recorded from its first strike or not at all.
   */
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const [takes, setTakes] = useState<Take[]>([]);
  const takeCount = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  /** When the last session began, for the head of its log after it has ended. */
  const lastBeganRef = useRef<Date | null>(null);

  /**
   * Everything the last listening session heard, and what MIDI witnessed.
   *
   * It names the expected notes, which the app otherwise never does. That is
   * the price of being able to tell, at the instrument, whether a stuck
   * highlight means "heard nothing" or "heard the wrong thing". The strip
   * under the score shows its last few strikes, and only when switched on in
   * the settings; off by default, so that practice never starts with the
   * answers showing.
   */
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<LogEntry[]>([]);
  const [protocolOn, setProtocolOn] = useState(false);

  const addEntry = useCallback((entry: LogEntry) => {
    logRef.current = [...logRef.current, entry];
    setLog(logRef.current);
  }, []);

  /** The head of the log: what was practised, on what, and when. */
  const header = useCallback((began: Date | null) => {
    return [
      "Piano Trainer — Anschlagsprotokoll",
      ...opts.current.describe(),
      began ? `Beginn: ${began.toLocaleString("de-DE")}` : "",
      `Gerät: ${navigator.userAgent}`,
    ].filter(Boolean);
  }, []);

  /** Closes the session; a recorded one becomes a take. */
  const finishSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    const stitcher = session?.stitcher;
    if (!session || !stitcher || stitcher.length === 0) return;

    const samples = stitcher.samples();
    const seconds = samples.length / stitcher.sampleRate;
    const name = `mitschnitt-${stamp(session.began)}`;
    const entries = logRef.current;
    const json = JSON.stringify(
      {
        app: "piano-trainer",
        format: 1,
        began: session.began.toISOString(),
        sampleRate: stitcher.sampleRate,
        seconds,
        // Sample counts against seconds since listening began, about one a
        // second: the WAV and the log on one time line.
        anchors: stitcher.anchors,
        gaps: stitcher.gaps,
        log: entries,
        text: formatLog(entries, header(session.began)),
      },
      null,
      1,
    );

    const take: Take = { id: ++takeCount.current, name, seconds, wav: encodeWav(samples, stitcher.sampleRate), json };
    setTakes((previous) => [...previous, take].slice(-TAKES_KEPT));
  }, [header]);

  const stopMic = useCallback(() => {
    unlistenMicRef.current?.();
    unlistenMicRef.current = null;
    micRef.current?.stop();
    listeningRef.current = false;
    setListening(false);
    finishSession();
  }, [finishSession]);

  const stopMidi = useCallback(() => {
    unlistenMidiRef.current?.();
    unlistenMidiRef.current = null;
    midiRef.current?.stop();
    setMidiDevices(null);
  }, []);

  /** Hands the engine over to the microphone, or takes it back. */
  async function toggleMic() {
    if (listening) {
      stopMic();
      return;
    }

    opts.current.beforeListening();
    // A witness may stay while the session is recorded; otherwise one input.
    if (!recordingRef.current) stopMidi();
    setMicError(null);

    micRef.current ??= new MicInput();
    const mic = micRef.current;

    try {
      await mic.start();
    } catch (e: unknown) {
      setMicError(describeError(e));
      return;
    }

    const stitcher = recordingRef.current ? new Stitcher(mic.sampleRate) : null;
    const began = new Date();
    sessionRef.current = { began, since: mic.listeningSince, stitcher };
    lastBeganRef.current = began;
    logRef.current = [];
    setLog([]);

    const offFrame = stitcher ? mic.onFrame((window, at) => stitcher.feed(window, at)) : () => {};
    // The strike is reported before its note, so the log reads what was
    // expected before the note moves the position on.
    const offHeard = mic.onHeard((heard) => {
      addEntry({
        kind: "heard",
        at: heard.struckAt,
        heard,
        expected: opts.current.expected(),
        where: opts.current.where(),
      });
    });
    const offNote = mic.onNoteOn((note) => opts.current.onNote(note));
    unlistenMicRef.current = () => {
      offFrame();
      offHeard();
      offNote();
    };
    listeningRef.current = true;
    setListening(true);
  }

  /**
   * Hands the engine over to a MIDI keyboard, or takes it back — or, while a
   * session is being recorded, connects it as a witness beside the microphone.
   *
   * Unlike the microphone it stays on while a passage plays back, and on the
   * way to the home screen and back: it holds no audio, so there is nothing to
   * collide with. Keys pressed during playback are ignored rather than judged
   * — the highlight follows the sound until it stops.
   */
  async function toggleMidi() {
    if (midiDevices !== null) {
      stopMidi();
      return;
    }

    if (!sessionRef.current?.stitcher) stopMic();
    setMidiError(null);

    midiRef.current ??= new MidiInput();
    const midi = midiRef.current;

    try {
      await midi.start();
    } catch (e: unknown) {
      setMidiError(describeError(e));
      return;
    }

    const offNote = midi.onNoteOn((note) => {
      // The microphone drives: MIDI is only a witness and plays nothing.
      if (listeningRef.current) return;
      if (opts.current.playingBack()) return;
      opts.current.onNote(note);
    });
    const offKeys = midi.onKeyEvent((event) => {
      const session = sessionRef.current;
      if (!session?.stitcher) return;
      addEntry({ kind: "key", at: (event.time - session.since) / 1000, event });
    });
    const offDevices = midi.onDevicesChange(setMidiDevices);
    unlistenMidiRef.current = () => {
      offNote();
      offKeys();
      offDevices();
    };
    setMidiDevices(midi.deviceNames);
  }

  function switchRecording(on: boolean) {
    if (listeningRef.current) return;
    recordingRef.current = on;
    setRecording(on);
  }

  /** Puts the last session's log on the clipboard as text. Reports whether it worked. */
  async function copyLog(): Promise<boolean> {
    const text = formatLog(logRef.current, header(lastBeganRef.current));
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // Both devices are only given back when the app itself goes away.
  useEffect(() => {
    return () => {
      unlistenMicRef.current?.();
      micRef.current?.stop();
      micRef.current = null;
      unlistenMidiRef.current?.();
      midiRef.current?.stop();
      midiRef.current = null;
    };
  }, []);

  const heardLines: ProtocolEntry[] = [];
  for (let i = log.length - 1; i >= 0 && heardLines.length < PROTOCOL_LINES; i--) {
    const entry = log[i];
    if (entry.kind === "heard") heardLines.push({ heard: entry.heard, expected: entry.expected });
  }

  return {
    mic: {
      supported: MicInput.isSupported(),
      on: listening,
      /** True while the session now listening is recorded. */
      recording: listening && recording,
      error: micError,
      toggle: toggleMic,
      stop: stopMic,
    },
    midi: {
      supported: MidiInput.isSupported(),
      devices: midiDevices,
      /** True while MIDI only writes along beside a recorded microphone. */
      witness: midiDevices !== null && listening && recording,
      error: midiError,
      toggle: toggleMidi,
    },
    protocol: { on: protocolOn, entries: heardLines, switch: setProtocolOn },
    recording: {
      on: recording,
      switch: switchRecording,
      takes,
      hasLog: log.length > 0,
      copyLog,
    },
  };
}

/** A date as 2026-11-11-1032, for file names that sort by time. */
function stamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-` +
    `${two(date.getHours())}${two(date.getMinutes())}`
  );
}
