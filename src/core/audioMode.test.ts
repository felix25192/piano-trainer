import { describe, expect, it } from "vitest";
import { categoryFor, conflicts, handover, type AudioMode } from "./audioMode";

describe("which category a mode needs", () => {
  /*
   * The one that cost a day. A bare context lands in `ambient`, which the ring
   * switch silences outright, so playing back has to ask for `playback` — and
   * `playback` is exactly the category a microphone may not be opened under.
   */
  it("asks for playback when playing, so the ring switch stays out of it", () => {
    expect(categoryFor("playing")).toBe("playback");
  });

  it("asks for play-and-record when listening, the only one that may record", () => {
    expect(categoryFor("listening")).toBe("play-and-record");
  });

  it("gives the device back when idle", () => {
    expect(categoryFor("idle")).toBe("auto");
  });
});

describe("handing the device over", () => {
  it("claims without releasing when nothing held it", () => {
    expect(handover("idle", "playing")).toEqual({
      unchanged: false,
      release: false,
      claim: "playback",
    });
  });

  /*
   * The case the app got wrong: a microphone that is not released keeps the
   * whole device in a recording session, and playback goes quiet in other tabs
   * and other apps as well.
   */
  it("releases the microphone before it plays anything", () => {
    expect(handover("listening", "playing")).toEqual({
      unchanged: false,
      release: true,
      claim: "playback",
    });
  });

  it("releases playback before it listens", () => {
    expect(handover("playing", "listening")).toEqual({
      unchanged: false,
      release: true,
      claim: "play-and-record",
    });
  });

  it("releases on the way back to idle", () => {
    expect(handover("playing", "idle").release).toBe(true);
    expect(handover("listening", "idle").release).toBe(true);
  });

  it("does nothing when it is already there", () => {
    for (const mode of ["idle", "playing", "listening"] as AudioMode[]) {
      expect(handover(mode, mode).unchanged, mode).toBe(true);
      expect(handover(mode, mode).release, mode).toBe(false);
    }
  });
});

describe("what may coexist", () => {
  it("refuses to let playing and listening hold the device together", () => {
    expect(conflicts("playing", "listening")).toBe(true);
    expect(conflicts("listening", "playing")).toBe(true);
  });

  it("lets idle sit beside anything", () => {
    expect(conflicts("idle", "playing")).toBe(false);
    expect(conflicts("listening", "idle")).toBe(false);
    expect(conflicts("idle", "idle")).toBe(false);
  });

  it("does not mind a mode beside itself", () => {
    expect(conflicts("playing", "playing")).toBe(false);
  });
});
