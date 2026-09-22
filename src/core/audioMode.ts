/**
 * The rule that the device's audio can only be used for one thing at a time.
 *
 * On iOS an app holds exactly one audio session, and its category decides what
 * that session may do. Playing back and listening need different categories,
 * so they cannot both be held: claiming one takes the other away. The same is
 * true of a native app, because the categories are the operating system's and
 * not the browser's.
 *
 * This file is the rule; `adapters/audioSession.ts` is the only thing allowed
 * to act on it. They were separated after the rule lived as a comment in three
 * places, was obeyed by none of them, and a day was spent on fixes that each
 * broke the previous one.
 */

/** What the app is doing with the device's audio. Never two of them. */
export type AudioMode = "idle" | "playing" | "listening";

/**
 * The category the device's session has to be in.
 *
 * `playback` is what a music player asks for, and it is not silenced by the
 * ring switch — `auto` leaves a bare context in `ambient`, which is. And
 * `play-and-record` is the only category that may open a microphone, which is
 * exactly why it cannot be held at the same time as `playback`.
 */
export type SessionCategory = "auto" | "playback" | "play-and-record";

export function categoryFor(mode: AudioMode): SessionCategory {
  switch (mode) {
    case "playing":
      return "playback";
    case "listening":
      return "play-and-record";
    case "idle":
      return "auto";
  }
}

/** What has to happen to move the device from one mode into another. */
export interface Handover {
  /** Nothing to do; already there. */
  unchanged: boolean;
  /**
   * Whatever holds the device now has to let go first.
   *
   * Not an optimisation. A microphone that is not released keeps the whole
   * device in a recording session, and playback then goes quiet everywhere —
   * in other tabs and other apps too.
   */
  release: boolean;
  /** The category to claim before the new mode may begin. */
  claim: SessionCategory;
}

export function handover(from: AudioMode, to: AudioMode): Handover {
  if (from === to) return { unchanged: true, release: false, claim: categoryFor(to) };
  return { unchanged: false, release: from !== "idle", claim: categoryFor(to) };
}

/** True when the two want the device at the same time and cannot both have it. */
export function conflicts(a: AudioMode, b: AudioMode): boolean {
  if (a === "idle" || b === "idle") return false;
  return a !== b;
}
