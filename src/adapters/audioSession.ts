import { categoryFor, handover, type AudioMode } from "../core/audioMode";

/**
 * The one place that touches the device's audio.
 *
 * Creating an `AudioContext`, setting the session category, opening and
 * closing a microphone: all of it goes through here and nowhere else. The rule
 * it enforces lives in `core/audioMode.ts`.
 *
 * It is a single shared instance on purpose, which is unusual enough to
 * explain. The device has exactly one audio session; modelling it as one
 * object is honest, and it removes by construction the failure that produced
 * it — two parts of the app each grabbing the device, neither knowing about
 * the other, each one's fix breaking the other.
 */

/** What listening hands back: the context to analyse in, and the microphone. */
export interface Listening {
  ctx: AudioContext;
  stream: MediaStream;
}

export interface ListenOptions {
  /**
   * The device's own level control.
   *
   * Off by default, together with echo cancellation and noise suppression:
   * all three are built for speech and take a piano apart. Worth being able to
   * switch on, because it is a candidate whenever a signal arrives very quiet.
   */
  autoGainControl?: boolean;
}

/** True when this browser can make a sound at all. */
export function isAudioSupported(): boolean {
  return typeof AudioContext !== "undefined";
}

class AudioSession {
  private mode: AudioMode = "idle";
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;

  constructor() {
    if (typeof document === "undefined") return;

    /*
     * Hidden is not the same as gone, and the two need different answers.
     *
     * Merely hidden — another tab in front, the screen off — releases the
     * microphone and nothing else. A forgotten tab holding one puts the whole
     * device into a recording session and takes the sound away from everything
     * else, which looks exactly like an app that has broken. Playback stays,
     * because on a desktop a switched-away tab is expected to keep playing and
     * tearing it down would cut a passage off at every notification.
     *
     * Leaving the page releases everything. That is what happens on the way
     * from the app to the device test and back, and each of those pages has
     * its own owner — one per document, since that is the scope a module gets.
     * Without this they would hold the device against each other, and the
     * invariant would stop at the page boundary just where it matters.
     */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.mode === "listening") {
        void this.release();
      }
    });
    window.addEventListener("pagehide", () => void this.release());
  }

  get current(): AudioMode {
    return this.mode;
  }

  /**
   * Takes the device for playing back and hands over a running context.
   *
   * The context may be a different one than last time — see `enter`. Anything
   * decoded against the old one has to be decoded again, so callers compare it
   * by identity rather than assuming it is theirs forever.
   */
  async play(): Promise<AudioContext> {
    await this.enter("playing");
    if (!this.ctx) throw new Error("Kein Audio-Kontext.");
    return this.ctx;
  }

  /** Takes the device for listening and opens the microphone. */
  async listen(options: ListenOptions = {}): Promise<Listening> {
    await this.enter("listening");
    if (!this.ctx) throw new Error("Kein Audio-Kontext.");

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: options.autoGainControl ?? false,
      },
    });

    return { ctx: this.ctx, stream: this.stream };
  }

  /** Gives the device back. Safe to call when it was never taken. */
  async release(): Promise<void> {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }

    if (this.ctx) {
      await this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }

    this.mode = "idle";
    claim(categoryFor("idle"));
  }

  /**
   * Moves the device into a mode, doing the steps the rule asks for.
   *
   * The category is claimed *before* the context exists, because Safari files
   * a context under whatever session was in force when it was built — setting
   * it afterwards changes nothing for a context that already exists. That is
   * also why a mode change tears the context down rather than reusing it.
   */
  private async enter(mode: AudioMode): Promise<void> {
    const step = handover(this.mode, mode);

    if (step.unchanged && this.ctx && (await running(this.ctx))) return;

    if (step.release || this.ctx) await this.release();

    claim(step.claim);
    this.mode = mode;

    const ctx = new AudioContext();
    if (await running(ctx)) {
      this.ctx = ctx;
      return;
    }

    /*
     * A context that will not start is not a rare accident on iOS: the system
     * parks one whenever it claims the audio session for itself. Its clock
     * then stops, everything scheduled against it is silent, and the app
     * believes it is playing — failure that looks like working. Better to say
     * so than to let it happen quietly.
     */
    await ctx.close().catch(() => undefined);
    this.mode = "idle";
    claim(categoryFor("idle"));
    throw new Error(
      "Das Gerät gibt gerade keinen Ton frei. Das passiert, wenn eine andere " +
        "Seite oder App das Mikrofon hält, oder während eines Anrufs.",
    );
  }
}

/**
 * Tells the device what kind of audio this is.
 *
 * Safari 16.4 and later, and not in the type definitions yet, hence the narrow
 * cast. Where it is missing nothing happens and the ring switch keeps the last
 * word, which is the behaviour there was before.
 */
function claim(category: string): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  if (session) session.type = category;
}

/**
 * Asks a context to run and reports whether it did.
 *
 * `resume` rejects outright in some states and quietly does nothing in others,
 * so the promise is not the answer — the state afterwards is.
 */
async function running(ctx: AudioContext): Promise<boolean> {
  try {
    await ctx.resume();
  } catch {
    // Some states refuse; the check below decides either way.
  }
  return ctx.state === "running";
}

/** The device has one audio session, so there is one of these. */
export const audioSession = new AudioSession();
