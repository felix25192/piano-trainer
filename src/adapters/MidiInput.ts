import type { NoteInputSource, NoteListener, PlayedNote } from "../core/NoteInputSource";
import { struckKey } from "../core/midiMessages";
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

    // Web MIDI hands over one whole message per event; what counts as a
    // struck key is decided in core, the same for every route.
    const note = struckKey({ status: data[0], data1: data[1], data2: data[2] });

    // Pitch bend, control changes and stray data have no place upstream.
    if (note === null || !isOnPiano(note)) return;

    const played: PlayedNote = {
      midi: note,
      time: performance.now() - this.startedAt,
      // A key press is a fact, not an estimate.
      confidence: 1,
    };

    for (const listener of this.listeners) listener(played);
  }
}
