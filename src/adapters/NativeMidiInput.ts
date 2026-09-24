import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { NoteInputSource, NoteListener, PlayedNote } from "../core/NoteInputSource";
import { channelMessagesOf, struckKey } from "../core/midiMessages";
import { isOnPiano } from "../core/pitch";

/**
 * Reads a MIDI keyboard inside the iOS shell, through CoreMIDI.
 *
 * The iPad's counterpart to `MidiInput`: Safari and every iOS web view lack
 * Web MIDI, so on the iPad a key press can only arrive through native code —
 * the small bridge in `native/midi-bridge`. That bridge hands over raw
 * Universal MIDI Packet words and nothing else; which of them strike a key is
 * decided in `core/midiMessages.ts`, the same rule the Web MIDI route uses.
 *
 * USB and Bluetooth look the same from here. A Bluetooth keyboard has to be
 * paired once, which is what `pairBluetooth` is for — iOS does not connect
 * Bluetooth MIDI on its own.
 */

interface MidiBridge {
  start(): Promise<{ sources: string[] }>;
  stop(): Promise<void>;
  pairBluetooth(): Promise<void>;
  addListener(event: "words", listener: (event: { words: number[] }) => void): Promise<PluginListenerHandle>;
}

const bridge = registerPlugin<MidiBridge>("MidiBridge");

export class NativeMidiInput implements NoteInputSource {
  readonly name = "MIDI";

  private listeners = new Set<NoteListener>();
  private subscription: PluginListenerHandle | null = null;
  private startedAt = 0;
  private sources: string[] = [];

  /** True only inside the iOS shell; the published web app has no bridge. */
  static isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  async start(): Promise<void> {
    this.stop();
    this.subscription = await bridge.addListener("words", ({ words }) => this.handle(words));
    this.startedAt = performance.now();
    ({ sources: this.sources } = await bridge.start());
    if (this.sources.length === 0) {
      throw new Error(
        "Kein MIDI-Gerät gefunden. Ist das Piano eingeschaltet — und über Bluetooth gekoppelt oder per Kabel verbunden?",
      );
    }
  }

  stop(): void {
    void this.subscription?.remove();
    this.subscription = null;
    void bridge.stop();
  }

  /** Opens Apple's dialog for pairing a Bluetooth MIDI keyboard. */
  pairBluetooth(): Promise<void> {
    return bridge.pairBluetooth();
  }

  /** Names of the connected sources, for the settings. */
  get deviceNames(): string[] {
    return this.sources;
  }

  onNoteOn(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private handle(words: number[]): void {
    const time = performance.now() - this.startedAt;
    for (const message of channelMessagesOf(words)) {
      const midi = struckKey(message);
      if (midi === null || !isOnPiano(midi)) continue;
      // A key press is a fact, not an estimate.
      const played: PlayedNote = { midi, time, confidence: 1 };
      for (const listener of this.listeners) listener(played);
    }
  }
}
