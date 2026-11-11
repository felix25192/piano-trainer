import type { NoteInputSource, NoteListener, PlayedNote } from "../core/NoteInputSource";
import { isOnPiano } from "../core/pitch";
import type { KeyEvent } from "../core/sessionLog";

/**
 * Reads note onsets from a MIDI keyboard over the Web MIDI API.
 *
 * Exact where the microphone infers: a key press is a fact, both hands at once
 * are simply several of them, and the pedal never blurs anything. That also
 * makes it the yardstick the microphone gets measured against, at a real
 * instrument rather than against recordings.
 *
 * Where it works: Chrome, Edge and Firefox on the desktop. Safari has no Web
 * MIDI on any platform, so on an iPad it can only arrive through a browser that
 * brings its own — the "Web MIDI Browser" app claims to, untested here — or
 * through the native shell on the `ios-spike` branch.
 */

const NOTE_ON = 0x90;
const STATUS_MASK = 0xf0;

/** Gets the names of the connected keyboards whenever one comes or goes. */
export type DevicesListener = (names: string[]) => void;

export type KeyEventListener = (event: KeyEvent) => void;

const NOTE_OFF = 0x80;
const CONTROL = 0xb0;
const SUSTAIN = 64;

export class MidiInput implements NoteInputSource {
  readonly name: string;

  private access: MIDIAccess | null = null;
  private ports: MIDIInput[] = [];
  private listeners = new Set<NoteListener>();
  private deviceListeners = new Set<DevicesListener>();
  private keyListeners = new Set<KeyEventListener>();
  /**
   * Counts stops, so a start still waiting for permission can tell that it
   * was called off meanwhile and must not attach to anything.
   */
  private generation = 0;
  private readonly onMessage = (event: MIDIMessageEvent) => this.handle(event);

  constructor(name = "MIDI-Keyboard") {
    this.name = name;
  }

  /** False in Safari, and anywhere the page is not served over HTTPS or localhost. */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  }

  async start(): Promise<void> {
    if (!MidiInput.isSupported()) {
      throw new Error("Dieser Browser kennt kein MIDI. Am Rechner geht es in Chrome oder Edge.");
    }

    this.stop();
    const generation = this.generation;

    let access: MIDIAccess;
    try {
      // Without sysex the permission prompt is far less alarming, and nothing
      // here needs it.
      access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      throw new Error("Der Zugriff auf MIDI wurde nicht erlaubt.");
    }
    if (generation !== this.generation) return;

    this.access = access;
    this.attach();

    if (this.ports.length === 0) {
      this.stop();
      throw new Error(
        "Kein MIDI-Gerät gefunden. Ist das Klavier eingeschaltet und per USB verbunden?",
      );
    }

    // A keyboard switched off and on again, or a cable pulled and plugged back
    // in, returns as a new connection. Without this the app would stay deaf to
    // it until MIDI was switched off and on by hand.
    access.onstatechange = () => this.attach();
  }

  /**
   * Lets go of every keyboard. On Windows that matters beyond this page: a
   * MIDI port held open by one program may be refused to every other.
   */
  stop(): void {
    this.generation++;
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    for (const port of this.ports) release(port);
    this.ports = [];
  }

  onNoteOn(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onDevicesChange(listener: DevicesListener): () => void {
    this.deviceListeners.add(listener);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  /**
   * Every key down and up and every move of the sustain pedal. Not part of
   * the port, which only wants struck notes: this is for a record of what
   * the hands and the foot did, beside what the microphone heard.
   */
  onKeyEvent(listener: KeyEventListener): () => void {
    this.keyListeners.add(listener);
    return () => {
      this.keyListeners.delete(listener);
    };
  }

  /** Names of the connected keyboards. */
  get deviceNames(): string[] {
    return this.ports.map((p) => p.name || "MIDI-Gerät ohne Namen");
  }

  /**
   * Listens to every input that is connected now, and to nothing else.
   *
   * Called on start and again whenever a device comes or goes. Browsers differ
   * in whether a port that went away stays in the list as "disconnected" or
   * leaves it, so both are handled by asking for the state.
   */
  private attach(): void {
    if (!this.access) return;

    const connected = [...this.access.inputs.values()].filter((p) => p.state === "connected");
    for (const port of this.ports) {
      if (!connected.includes(port)) release(port);
    }

    const before = this.deviceNames.join("\n");
    for (const port of connected) {
      // Setting the handler opens the port. A port that came back may still
      // carry the handler from before and yet be closed, so it is opened
      // explicitly as well.
      port.onmidimessage = this.onMessage;
      if (port.connection !== "open") port.open().catch(() => {});
    }
    this.ports = connected;

    if (this.deviceNames.join("\n") !== before) {
      for (const listener of this.deviceListeners) listener(this.deviceNames);
    }
  }

  private handle(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 3) return;

    const [status, note, velocity] = data;
    const time = event.timeStamp > 0 ? event.timeStamp : performance.now();
    if (this.keyListeners.size > 0) this.report(status & STATUS_MASK, note, velocity, time);

    // Most keyboards, including the Kawai ES series, end a note by sending
    // note-on with velocity zero rather than an actual note-off message —
    // so velocity is what decides here, not the status byte alone. The
    // channel is ignored: a keyboard sends on whichever it is set to.
    if ((status & STATUS_MASK) !== NOTE_ON || velocity === 0) return;

    // Pitch bend, control changes and stray data have no place upstream.
    if (!isOnPiano(note)) return;

    const played: PlayedNote = {
      midi: note,
      // When the keyboard said so, on the page's clock; the event carries it.
      // A browser that leaves it empty gets the moment it arrived instead.
      time,
      // A key press is a fact, not an estimate.
      confidence: 1,
    };

    for (const listener of this.listeners) listener(played);
  }
  private report(kind: number, note: number, velocity: number, time: number): void {
    let event: KeyEvent | null = null;
    if (kind === NOTE_ON && velocity > 0) event = { kind: "down", midi: note, velocity, time };
    else if (kind === NOTE_OFF || (kind === NOTE_ON && velocity === 0)) {
      event = { kind: "up", midi: note, velocity, time };
    } else if (kind === CONTROL && note === SUSTAIN) event = { kind: "pedal", down: velocity >= 64, time };
    if (event) for (const listener of this.keyListeners) listener(event);
  }
}

function release(port: MIDIInput): void {
  port.onmidimessage = null;
  port.close().catch(() => {});
}
