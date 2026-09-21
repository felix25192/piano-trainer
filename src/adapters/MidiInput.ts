import type { NoteInputSource, NoteListener, PlayedNote } from "../core/NoteInputSource";
import { isOnPiano } from "../core/pitch";

/**
 * Reads note onsets from a MIDI keyboard over the Web MIDI API.
 *
 * Note for anyone reading this on an iPad: Safari does not implement Web MIDI,
 * on any platform or version. This adapter therefore only works in Chrome,
 * Edge and Firefox on the desktop. That is not a gap to be closed later — it
 * is why MicInput exists. On the desktop this is the exact, latency-free input
 * the microphone path gets measured against.
 */

const NOTE_ON = 0x90;
const STATUS_MASK = 0xf0;

export class MidiInput implements NoteInputSource {
  readonly name: string;

  private ports: MIDIInput[] = [];
  private listeners = new Set<NoteListener>();
  private startedAt = 0;

  constructor(name = "MIDI keyboard") {
    this.name = name;
  }

  /** False in Safari, and anywhere the page is not served over HTTPS or localhost. */
  static isSupported(): boolean {
    return "requestMIDIAccess" in navigator;
  }

  async start(): Promise<void> {
    if (!MidiInput.isSupported()) {
      throw new Error(
        "This browser has no Web MIDI support. Safari never has — use the microphone there.",
      );
    }

    // Without sysex the permission prompt is far less alarming, and nothing
    // here needs it.
    const access = await navigator.requestMIDIAccess({ sysex: false });
    this.startedAt = performance.now();

    this.ports = [...access.inputs.values()];
    if (this.ports.length === 0) {
      throw new Error("No MIDI device found. Is the piano switched on and connected?");
    }

    for (const port of this.ports) {
      port.onmidimessage = (event) => this.handle(event as MIDIMessageEvent);
    }
  }

  stop(): void {
    for (const port of this.ports) port.onmidimessage = null;
    this.ports = [];
  }

  onNoteOn(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Names of the connected devices, for the settings screen. */
  get deviceNames(): string[] {
    return this.ports.map((p) => p.name ?? "unnamed device");
  }

  private handle(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 3) return;

    const [status, note, velocity] = data;

    // Most keyboards, including the Kawai ES series, end a note by sending
    // note-on with velocity zero rather than an actual note-off message —
    // so velocity is what decides here, not the status byte alone.
    if ((status & STATUS_MASK) !== NOTE_ON || velocity === 0) return;

    // Pitch bend, control changes and stray data have no place upstream.
    if (!isOnPiano(note)) return;

    const played: PlayedNote = {
      midi: note,
      time: performance.now() - this.startedAt,
      // A key press is a fact, not an estimate.
      confidence: 1,
    };

    for (const listener of this.listeners) listener(played);
  }
}
