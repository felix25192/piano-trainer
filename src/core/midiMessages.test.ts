import { describe, expect, it } from "vitest";
import { channelMessagesOf, struckKey } from "./midiMessages";

/** One MIDI 1.0 channel voice word, as CoreMIDI packs it: type 2, group 0. */
function word(status: number, data1: number, data2: number): number {
  return ((0x2 << 28) | (status << 16) | (data1 << 8) | data2) >>> 0;
}

const struck = (words: number[]) =>
  channelMessagesOf(words)
    .map(struckKey)
    .filter((k) => k !== null);

describe("universal MIDI packets", () => {
  it("reads a struck C4", () => {
    expect(struck([word(0x90, 60, 64)])).toEqual([60]);
  });

  it("reads every key of a chord delivered together", () => {
    expect(struck([word(0x90, 60, 70), word(0x90, 64, 70), word(0x90, 67, 70)])).toEqual([
      60, 64, 67,
    ]);
  });

  it("takes a note-on at velocity zero for a key let go, as the Kawai sends it", () => {
    expect(struck([word(0x90, 60, 0)])).toEqual([]);
  });

  it("ignores a note-off", () => {
    expect(struck([word(0x80, 60, 40)])).toEqual([]);
  });

  it("reads channels other than the first", () => {
    expect(struck([word(0x93, 48, 50)])).toEqual([48]);
  });

  it("keeps the pedal as a message but strikes nothing with it", () => {
    const [pedal] = channelMessagesOf([word(0xb0, 64, 127)]);
    expect(pedal).toEqual({ status: 0xb0, data1: 64, data2: 127 });
    expect(struckKey(pedal)).toBeNull();
  });

  /*
   * A two-word system exclusive packet between two notes. Read one word at a
   * time, its second word would be taken for a message of its own.
   */
  it("steps over longer packets whole instead of misreading them", () => {
    const sysex = [0x30160043, 0x10203040];
    expect(struck([word(0x90, 60, 64), ...sysex, word(0x90, 62, 64)])).toEqual([60, 62]);
  });

  it("does not read MIDI 2.0 notes, which were not asked for", () => {
    const midi2NoteOn = [0x40903c00, 0x80000000];
    expect(struck(midi2NoteOn)).toEqual([]);
  });

  it("copes with words handed over as signed numbers", () => {
    // A bridge may hand a word with the top bit set over as a negative integer.
    const signed = word(0x90, 60, 64) | 0;
    expect(struck([signed])).toEqual([60]);
  });
});
