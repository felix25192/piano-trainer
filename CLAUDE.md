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
- `core/playback.ts` — note values, tempo and pedal into seconds
- `core/pedal.ts` — pedal marks into spans; the pedal change is the trap
- `core/pitchDetect.ts` — YIN: samples in, one frequency out. Monophonic
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

`pitch-lab.html` at the repo root is the bench for the pitch detector: it puts
the thirty piano recordings through `core/pitchDetect.ts` and prints what came
back, at several window lengths and several points in the decay. Dev only —
Vite builds `index.html`, so it is never published. Open it at
<http://localhost:5173/pitch-lab.html>.

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

Where the score writes a damper pedal, it is honoured: the note goes on
sounding until the foot comes up. Only the Chopin writes any — 108 spans, and
with them it stops being a typing exercise. Measured against the score: its
opening chord rings 1.552 s where the notation alone would give 1.034.

The sound is recordings of a Yamaha C5, one every minor third, in
`public/piano/` — see its `SOURCES.md` for the licence, which requires the
attribution the settings panel carries. A synthesised tone came first and was
thrown out: it kept time perfectly and still sounded wrong, which is the whole
point of playing a passage rather than naming its notes. Levels were set by
metering rather than by ear, since no session here can listen: the densest of
the seven pieces peaks at 0.89 of full scale.

**Spike A passed in Safari on iOS.** Measured on the device, not assumed:
permission is granted, the stream runs, and `core/pitchDetect.ts` reports a
hummed note at a clarity of 0.94 to 1.00 — as sure of itself as it is against
the recordings on a desktop. So the microphone route is open, and the part
that is left is musical rather than technical.

What the same session also showed: piano music played back from a phone
speaker moves the meter barely at all. That is not the case the app is for
— a small speaker reproduces little below a few hundred hertz, which is where
most piano music lives, and a recording is polyphonic besides. A single note
played into the room is the case that matters, and a single note is what
works.

The expected notes are deliberately **not** displayed. Naming them turns the
exercise into reading text. A wrong note turns the highlight red instead.
Playing them back is the deliberate exception: it gives the ear something to
aim at and still leaves the eyes the work of finding it on the page.

## What is open

- **Spike A, from the home screen.** In Safari it passed — see What works.
  Launched from the home screen it is still untested, which is where the
  [long-standing WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=185448)
  would bite if it bites at all.
- **MicInput**: the large remaining adapter. Verification against expected
  notes, not polyphonic transcription — that distinction is what makes it
  feasible at all. The start screen already lists it as a third card, greyed
  out and labelled as unbuilt.

  The detector exists and is measured. Against the thirty recordings it gets
  **28 of 30 right in the first 50 ms after the strike**, and falls to 15 of 30
  three seconds later — a piano's fundamental dies before its partials do, and
  a low F sharp then reads an octave high. So the microphone path has to catch
  the *onset* and not the sustain, which is what the engine wants anyway: it
  asks whether a note was struck, never what is still ringing.

  Two of the four failures are simply below the silence floor — measured at
  0.0014 and 0.0016 against a threshold of 0.002 — and both are above the top
  of anything in the repertoire.

  **Detect over the whole range, then compare with what was expected.** The
  obvious shortcut — the app knows the note, so search only around it — was
  measured and is wrong. It is four times faster and it waves through 24 of 26
  octave errors, because a wave of period T also repeats at 2T, and 28 of 29
  semitone errors, because YIN normalises against the range it is computed
  over and a short range moves the threshold. Detecting broadly and comparing
  afterwards costs 18 ms and refuses every one of those: 0 of 26, 0 of 26, 0 of
  29, 0 of 29 across an octave up, an octave down, a semitone up and a semitone
  down. For a trainer that is the difference between working and lying.

  So speed is still open: 8 ms at a 4096-sample window, 18 ms at 8192, which is
  too much to run on every frame. The way out is not a narrower search but a
  rarer one — a cheap onset detector runs continuously and the expensive pass
  runs once per struck note. The rig already says the onset is the only moment
  worth asking about, so the two findings meet.
- **Tied notes are asked for twice.** A tie is one sound, held, not struck
  again — but the matcher still requires the continuation note to be played.
  The data to fix it is already there and playback honours it
  (`ExpectedNote.heldOver`); the matcher does not, because changing what the
  app demands of the player is a decision of its own, not a side effect of
  adding sound.
- **A home-screen app goes black after a deploy.** Verified: each build emits a
  new hashed bundle and GitHub Pages deletes the old one, so a standalone web
  app holding a cached `index.html` asks for an asset that is now a 404, React
  never mounts, and what is left on screen is the background colour. Pulling
  down to refresh inside the app fixes it, as does removing and re-adding the
  icon. A service worker serving the HTML network-first would fix it properly;
  there is none yet, and that is also why the first playback of a session needs
  the network.
- **Playback on iOS**: Web Audio is silenced by the ring switch, and the
  behaviour from the home screen is untested. Same class of unknown as Spike A.
- **The first playback of a session needs the network.** The recordings are
  fetched on the first press and kept, but only the ones the passage calls
  for, and there is no service worker to hold them offline. Practising away
  from a connection works once the browser has them cached; the first time
  does not.
- **Dynamics are ignored** when playing back — everything sounds equally loud,
  whatever the score marks.
- **Pedal only where it is written**, and six of the seven pieces write none.
  The Moonlight is the loss: its whole character is the raised dampers, and
  Beethoven said so — but as the words *senza sordini*, not as a pedal mark,
  so there is nothing in the data to read. A rule of thumb exists (change the
  pedal when the lowest sounding note changes) and would flatter that piece,
  but it would be wrong in the Bach. Left out for the same reason as the minor
  fingerings: a wrong pedal is worse than none.
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
