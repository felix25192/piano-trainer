import { useCallback, useEffect, useRef, useState } from "react";
import type { Heard } from "../core/hearing";
import { MicInput } from "../adapters/MicInput";
import { MidiInput } from "../adapters/MidiInput";
import { describeError } from "./format";

/** One line of the strike protocol: what was heard, and what was wanted then. */
export interface ProtocolEntry {
  heard: Heard;
  expected: number[];
}

/** Enough to see a pattern across a few notes without taking the score's height. */
const PROTOCOL_LINES = 4;

interface Options {
  /** Where every played note goes. */
  onNote: (midi: number) => void;
  /** What the engine waits for, for the protocol. */
  expected: () => number[];
  /** True while a passage plays back. Keys pressed then are ignored. */
  playingBack: () => boolean;
  /** Called before the microphone opens: playback has to give up the device first. */
  beforeListening: () => void;
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
   * What the microphone made of each strike, newest first — only while the
   * protocol is switched on.
   *
   * It names the expected notes, which the app otherwise never does. That is
   * the price of being able to tell, at the instrument, whether a stuck
   * highlight means "heard nothing" or "heard the wrong thing". Off by
   * default, and not remembered across a reload, so that practice never
   * starts with the answers showing.
   */
  const [protocolOn, setProtocolOn] = useState(false);
  const [protocol, setProtocol] = useState<ProtocolEntry[]>([]);
  const protocolOnRef = useRef(protocolOn);
  useEffect(() => {
    protocolOnRef.current = protocolOn;
  }, [protocolOn]);

  const stopMic = useCallback(() => {
    unlistenMicRef.current?.();
    unlistenMicRef.current = null;
    micRef.current?.stop();
    setListening(false);
  }, []);

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
    stopMidi();
    setMicError(null);

    micRef.current ??= new MicInput();
    const mic = micRef.current;

    try {
      await mic.start();
    } catch (e: unknown) {
      setMicError(describeError(e));
      return;
    }

    // The strike is reported before its note, so the protocol reads what was
    // expected before the note moves the position on.
    const offHeard = mic.onHeard((heard) => {
      if (!protocolOnRef.current) return;
      const expected = opts.current.expected();
      setProtocol((entries) => [{ heard, expected }, ...entries].slice(0, PROTOCOL_LINES));
    });
    const offNote = mic.onNoteOn((note) => opts.current.onNote(note.midi));
    unlistenMicRef.current = () => {
      offHeard();
      offNote();
    };
    setProtocol([]);
    setListening(true);
  }

  /**
   * Hands the engine over to a MIDI keyboard, or takes it back.
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

    stopMic();
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
      if (opts.current.playingBack()) return;
      opts.current.onNote(note.midi);
    });
    const offDevices = midi.onDevicesChange(setMidiDevices);
    unlistenMidiRef.current = () => {
      offNote();
      offDevices();
    };
    setMidiDevices(midi.deviceNames);
  }

  function switchProtocol(on: boolean) {
    setProtocolOn(on);
    setProtocol([]);
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

  return {
    mic: {
      supported: MicInput.isSupported(),
      on: listening,
      error: micError,
      toggle: toggleMic,
      stop: stopMic,
    },
    midi: {
      supported: MidiInput.isSupported(),
      devices: midiDevices,
      error: midiError,
      toggle: toggleMidi,
    },
    protocol: { on: protocolOn, entries: protocol, switch: switchProtocol },
  };
}
