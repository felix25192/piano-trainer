/**
 * What a MIDI message says, independent of the cable it came over.
 *
 * Two routes deliver MIDI into the app. Web MIDI, on the desktop, hands over
 * one message at a time as bytes. CoreMIDI, in the iOS shell, hands over
 * Universal MIDI Packets: 32-bit words, several messages to a delivery — a
 * chord struck at once arrives together. Both end up here, so that what counts
 * as a struck key is decided once.
 */

/** A MIDI 1.0 channel message: a status byte and its two data bytes. */
export interface ChannelMessage {
  status: number;
  data1: number;
  data2: number;
}

const NOTE_ON = 0x90;
const STATUS_MASK = 0xf0;

/**
 * How many 32-bit words a Universal MIDI Packet of each message type takes.
 *
 * The type is the top four bits of the first word. Only type 2 — MIDI 1.0
 * channel voice, one word — is read; the table is there so that anything else
 * in the same delivery, a system exclusive message for instance, is stepped
 * over whole instead of being misread as notes. The sizes are the ones the
 * MIDI 2.0 Universal MIDI Packet specification assigns to each type.
 */
const WORDS_BY_TYPE = [1, 1, 1, 2, 2, 4, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4];

const MIDI1_CHANNEL_VOICE = 0x2;

/**
 * The MIDI 1.0 channel messages in a run of Universal MIDI Packet words.
 *
 * Asked for with the MIDI 1.0 protocol, CoreMIDI packs each channel message
 * into one word: type and group in the top byte, then status, then the two
 * data bytes.
 */
export function channelMessagesOf(words: readonly number[]): ChannelMessage[] {
  const out: ChannelMessage[] = [];
  let i = 0;
  while (i < words.length) {
    const word = words[i] >>> 0;
    const type = word >>> 28;
    if (type === MIDI1_CHANNEL_VOICE) {
      out.push({ status: (word >>> 16) & 0xff, data1: (word >>> 8) & 0x7f, data2: word & 0x7f });
    }
    i += WORDS_BY_TYPE[type];
  }
  return out;
}

/**
 * The key a message strikes, or null when it strikes none.
 *
 * Most keyboards, including the Kawai ES series, end a note by sending note-on
 * with velocity zero rather than an actual note-off message — so velocity is
 * what decides here, not the status byte alone.
 */
export function struckKey(message: ChannelMessage): number | null {
  if ((message.status & STATUS_MASK) !== NOTE_ON) return null;
  if (message.data2 === 0) return null;
  return message.data1;
}
