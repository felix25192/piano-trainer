import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MidiInput } from "./MidiInput";
import type { PlayedNote } from "../core/NoteInputSource";

/**
 * The adapter is thin, but two things in it are decisions rather than plumbing,
 * and both would fail silently at the instrument: which bytes count as a struck
 * key, and that a keyboard switched off and on again is heard again. Web MIDI
 * itself is replaced by a stand-in that holds ports and delivers bytes.
 */

class FakePort {
  state: "connected" | "disconnected" = "connected";
  connection: "open" | "closed" | "pending" = "closed";
  onmidimessage: ((event: { data: Uint8Array; timeStamp: number }) => void) | null = null;

  readonly id: string;
  readonly name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  open() {
    this.connection = "open";
    return Promise.resolve(this);
  }

  close() {
    this.connection = "closed";
    return Promise.resolve(this);
  }

  send(...bytes: number[]) {
    this.sendAt(0, ...bytes);
  }

  /** With the timestamp a browser puts on the event; 0 is what one that leaves it empty gives. */
  sendAt(timeStamp: number, ...bytes: number[]) {
    this.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp });
  }
}

class FakeAccess {
  inputs = new Map<string, FakePort>();
  onstatechange: (() => void) | null = null;

  plug(port: FakePort) {
    port.state = "connected";
    this.inputs.set(port.id, port);
    this.onstatechange?.();
  }

  /** Chrome keeps a port that went away in the list and marks it; so does this. */
  unplug(port: FakePort) {
    port.state = "disconnected";
    port.connection = "closed";
    this.onstatechange?.();
  }
}

let access: FakeAccess;
let kawai: FakePort;

beforeEach(() => {
  access = new FakeAccess();
  kawai = new FakePort("1", "Kawai ES520");
  access.inputs.set(kawai.id, kawai);
  vi.stubGlobal("navigator", { requestMIDIAccess: () => Promise.resolve(access) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function started(): Promise<{ midi: MidiInput; heard: number[] }> {
  const midi = new MidiInput();
  const heard: number[] = [];
  midi.onNoteOn((note: PlayedNote) => heard.push(note.midi));
  await midi.start();
  return { midi, heard };
}

describe("MidiInput", () => {
  it("reports a struck key as certain", async () => {
    const midi = new MidiInput();
    const notes: PlayedNote[] = [];
    midi.onNoteOn((n) => notes.push(n));
    await midi.start();

    kawai.send(0x90, 60, 64);

    expect(notes).toHaveLength(1);
    expect(notes[0].midi).toBe(60);
    expect(notes[0].confidence).toBe(1);
  });

  it("reports the strike at the time the keyboard stamped, on the page's clock", async () => {
    const midi = new MidiInput();
    const notes: PlayedNote[] = [];
    midi.onNoteOn((n) => notes.push(n));
    await midi.start();

    kawai.sendAt(1234.5, 0x90, 60, 64);
    kawai.send(0x90, 62, 64);

    expect(notes[0].time).toBe(1234.5);
    // No stamp: the moment it arrived, which is on the same clock.
    expect(Math.abs(notes[1].time - performance.now())).toBeLessThan(1000);
  });

  it("reports keys going down and up, and the pedal, for a witness", async () => {
    const midi = new MidiInput();
    const events: string[] = [];
    midi.onKeyEvent((e) => events.push(e.kind === "pedal" ? `pedal ${e.down}` : `${e.kind} ${e.midi}`));
    await midi.start();

    kawai.sendAt(10, 0x90, 60, 64);
    kawai.sendAt(11, 0xb0, 64, 127);
    kawai.sendAt(12, 0x90, 60, 0); // the Kawai's way of letting go
    kawai.sendAt(13, 0x80, 62, 40); // another keyboard's way
    kawai.sendAt(14, 0xb0, 64, 0);
    kawai.sendAt(15, 0xb0, 1, 90); // modulation: not ours

    expect(events).toEqual(["down 60", "pedal true", "up 60", "up 62", "pedal false"]);
  });

  it("takes a key on any channel", async () => {
    const { heard } = await started();
    kawai.send(0x93, 67, 80);
    expect(heard).toEqual([67]);
  });

  it("does not count the release of a key, in either spelling", async () => {
    const { heard } = await started();
    // How the Kawai ends a note: note-on at velocity zero.
    kawai.send(0x90, 60, 0);
    // How some other keyboards do: a real note-off.
    kawai.send(0x80, 60, 64);
    expect(heard).toEqual([]);
  });

  it("ignores the pedal and everything else that is not a key", async () => {
    const { heard } = await started();
    kawai.send(0xb0, 64, 127); // sustain pedal down
    kawai.send(0xe0, 0, 64); // pitch bend
    kawai.send(0xfe); // active sensing, one byte
    expect(heard).toEqual([]);
  });

  it("refuses to start with nothing connected, and says what to check", async () => {
    access.inputs.clear();
    await expect(new MidiInput().start()).rejects.toThrow(/Kein MIDI-Gerät/);
  });

  it("says so in words when access is refused", async () => {
    vi.stubGlobal("navigator", {
      requestMIDIAccess: () => Promise.reject(new DOMException("denied", "SecurityError")),
    });
    await expect(new MidiInput().start()).rejects.toThrow(/nicht erlaubt/);
  });

  it("hears a keyboard again after it was switched off and on", async () => {
    const { midi, heard } = await started();
    const devices: string[][] = [];
    midi.onDevicesChange((names) => devices.push(names));

    access.unplug(kawai);
    kawai.send(0x90, 60, 64);
    access.plug(kawai);
    kawai.send(0x90, 62, 64);

    expect(heard).toEqual([62]);
    expect(devices).toEqual([[], ["Kawai ES520"]]);
    expect(kawai.connection).toBe("open");
  });

  it("listens to a second keyboard plugged in later", async () => {
    const { midi, heard } = await started();
    const second = new FakePort("2", "USB MIDI");
    access.plug(second);
    second.send(0x90, 48, 64);

    expect(heard).toEqual([48]);
    expect(midi.deviceNames).toEqual(["Kawai ES520", "USB MIDI"]);
  });

  it("lets go of the keyboard on stop and stays deaf afterwards", async () => {
    const { midi, heard } = await started();
    midi.stop();

    kawai.send(0x90, 60, 64);
    access.plug(new FakePort("2", "USB MIDI"));

    expect(heard).toEqual([]);
    expect(kawai.connection).toBe("closed");
    expect(kawai.onmidimessage).toBeNull();
  });

  it("does not attach when stopped while still waiting for permission", async () => {
    let grant: (a: FakeAccess) => void = () => {};
    vi.stubGlobal("navigator", {
      requestMIDIAccess: () => new Promise<FakeAccess>((resolve) => (grant = resolve)),
    });
    const midi = new MidiInput();
    const starting = midi.start();
    midi.stop();
    grant(access);
    await starting;

    expect(kawai.onmidimessage).toBeNull();
    expect(midi.deviceNames).toEqual([]);
  });
});
