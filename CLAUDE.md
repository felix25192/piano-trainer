# Piano Trainer

A sight-reading trainer. Sheet music scrolls horizontally, and it advances only
when the correct note is played. Built by Felix as a learning project and a
portfolio piece — so the code is meant to be read, not just to work.

**Talk to Felix in German.** Code, comments and this file stay English; commit
messages and `docs/PLAN.md` are German. He has university programming basics,
wants to understand what is built, and reacts well to being told *why*.

## The standard that matters

Musical correctness is the point of the project, not a nice-to-have. The test
of any change is whether a pianist would find it right.

Concretely: **pitches are carried as letter, alteration and octave — never as a
bare MIDI number.** In D major the third degree is F sharp and never G flat; G
sharp minor raises its seventh to F double sharp. Anything that computes in
semitones writes nonsense at those places. `src/core/theory.ts` exists for this
reason and its tests name the cases.

When unsure about a musical fact, look it up. Wrong information stated
confidently is worse here than an admitted gap — see the minor fingerings.

## Architecture

Ports and adapters. Dependencies point inward.

```
src/core/       Pure TypeScript. No React, no DOM, no browser. Fully tested.
src/adapters/   One external thing each. Deliberately thin — no decisions,
                therefore almost no tests.
src/App.tsx     The shell. Subscribes; does not think.
src/Home.tsx    The start screen. Reports which mode was tapped; knows
                nothing about OSMD, storage or the engine.
```

- `core/theory.ts` — keys, scale spelling, MIDI conversion
- `core/fingering.ts` — the twelve major scale fingerings, as data
- `core/exercises.ts` — builds exercises for both hands
- `core/musicxml.ts` — serialises them
- `core/NoteMatcher.ts` — the engine: right note advances, wrong note stops
- `core/NoteInputSource.ts` — **the port** every input implements
- `core/playback.ts` — note values and tempo into seconds
- `core/NoteOutput.ts` — **the port** every sound output implements
- `adapters/osmdScore.ts` — the only file allowed to know OSMD's object graph
- `adapters/MidiInput.ts` — Web MIDI (desktop only; Safari has none)
- `adapters/SampledPiano.ts` — Web Audio, recordings of a real piano
- `adapters/scoreLibrary.ts` — IndexedDB

Generated exercises go out through MusicXML rather than straight into the
engine. That is deliberate: a generated scale then travels the exact same path
as a file from disk, and nothing downstream can tell them apart.

## Running it

**Node is not on the inherited PATH** — the Claude app starts with a stale
environment, and opening a new terminal tab does not help. Prefix every command:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
```

```bash
npx vitest run          # 160 tests
npx tsc -b --noEmit     # types
npx oxlint              # lint; silence means clean
npm run build
```

Dev server, started detached because `npm` resolution is unreliable here:

```bash
nohup "/c/Program Files/nodejs/node.exe" node_modules/vite/bin/vite.js --port 5173 &
```

**Deployment is automatic**: a push to `main` runs lint, tests, types and build,
and publishes to <https://felix25192.github.io/piano-trainer/>.

When testing in the built-in browser pane, note that `scrollTo({behavior:
"smooth"})` does not animate while the window is in the background. Patch
`scrollTo` to `behavior: "auto"` in a probe rather than concluding the app is
broken.

## What works

The app opens on a start screen: one card per mode, and above them the piece
from last time, so sitting down at the piano is one tap. Leaving a score for
it keeps the bar that was reached — within the session; a reload starts at the
top as before.

Scores render as one continuous horizontal staff line, both clefs, correct
accidentals, fitted to the viewport height automatically on every rotation —
up to `ZOOM_FIT_MAX`, past which a single bar would fill the screen and there
would be nothing ahead to read. Tapping the score sets the position. Piece and measure are chosen from the top
bar. Own MusicXML files can be loaded and persist. Exercises are generated for
twelve major and twelve harmonic minor keys, one to four octaves, parallel or
contrary motion, with fingerings for major.

Seven graded pieces ship with it, chosen for reading rather than playing — what
matters is being *unfamiliar*, since a piece you know by ear lets memory do the
work while the eyes learn nothing.

A passage can be played back from the highlight and stops on a second press,
at the tempo the score names — or at 75 % or half of it. The highlight runs
with the sound and stays where it stopped, so listening to a passage leaves
you ready to play the next one. Verified against the clock: the minuet's
quarters come out at 0.476 s and its eighths at 0.238 s, which is 126 exactly.

The sound is recordings of a Yamaha C5, one every minor third, in
`public/piano/` — see its `SOURCES.md` for the licence, which requires the
attribution the settings panel carries. A synthesised tone came first and was
thrown out: it kept time perfectly and still sounded wrong, which is the whole
point of playing a passage rather than naming its notes. Levels were set by
metering rather than by ear, since no session here can listen: the densest of
the seven pieces peaks at 0.89 of full scale.

The expected notes are deliberately **not** displayed. Naming them turns the
exercise into reading text. A wrong note turns the highlight red instead.
Playing them back is the deliberate exception: it gives the ear something to
aim at and still leaves the eyes the work of finding it on the page.

## What is open

- **Spike A**: microphone access on iOS, including from the home screen. The
  test page is live at `/mic-test.html`; it needs the device and a piano.
  A [long-standing WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=185448)
  may bite.
- **MicInput**: the large remaining adapter. Verification against expected
  notes, not polyphonic transcription — that distinction is what makes it
  feasible at all. MIDI on the desktop is the reference to measure it against.
  The start screen already lists it as a third card, greyed out and labelled
  as unbuilt.
- **Tied notes are asked for twice.** A tie is one sound, held, not struck
  again — but the matcher still requires the continuation note to be played.
  The data to fix it is already there and playback honours it
  (`ExpectedNote.heldOver`); the matcher does not, because changing what the
  app demands of the player is a decision of its own, not a side effect of
  adding sound.
- **Playback on iOS**: Web Audio is silenced by the ring switch, and the
  behaviour from the home screen is untested. Same class of unknown as Spike A.
- **The first playback of a session needs the network.** The recordings are
  fetched on the first press and kept, but only the ones the passage calls
  for, and there is no service worker to hold them offline. Practising away
  from a connection works once the browser has them cached; the first time
  does not.
- **Dynamics and pedal are ignored** when playing back — everything sounds
  equally loud and nothing rings on past its written length. Audible in the
  Chopin and the Moonlight, which are the two pieces that live on it.
- **Minor fingerings**: absent on purpose. They do not simply follow the
  parallel or relative major, and a wrongly practised fingering is harder to
  unlearn than none.
- **The band between the staves**: OSMD reserves height for dynamics across the
  whole piece, even in bars that have none. Measured, no switch exists for it.
- `bach-prelude-c-bwv846.mxl` has 34 bars where the autograph has 35. See
  `public/scores/SOURCES.md`.

Safari implements no Web MIDI on any platform, so a MIDI keyboard can only
reach the iPad through a native wrapper (Capacitor) later.

## History

`docs/PLAN.md` is the running log, newest sections last, each dated and each
explaining why a decision went the way it did. Commit messages carry the same
reasoning. Both are worth reading before changing something that looks odd —
it usually looks odd for a reason that is written down.
