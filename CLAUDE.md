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
- `core/audioMode.ts` — the rule that playing and listening cannot both hold
  the device
- `core/onset.ts` — notices a strike, cheaply, so the costly part runs rarely:
  by loudness, and by new partials appearing in the spectrum
- `core/spectrum.ts` — the analyser's spectrum, worked out in plain arithmetic
- `core/hearing.ts` — **the microphone loop**: a frame of samples in, a
  struck note out. The bench, the tests and the app all run this one
- `core/NoteOutput.ts` — **the port** every sound output implements
- `adapters/osmdScore.ts` — the only file allowed to know OSMD's object graph
- `adapters/MidiInput.ts` — Web MIDI (desktop only; Safari has none, and
  there is no Mac to build a native wrapper with, so it will never reach the
  iPad)
- `adapters/MicInput.ts` — the microphone: strike, then pitch. Monophonic
- `adapters/NativeMidiInput.ts` — MIDI inside the iOS shell, through the
  bridge in `native/midi-bridge`; `core/midiMessages.ts` reads what it hands over
- `adapters/audioSession.ts` — **the only file that touches the device's
  audio**: the context, the session category, the microphone
- `adapters/SampledPiano.ts` — Web Audio, recordings of a real piano
- `adapters/scoreLibrary.ts` — IndexedDB
- `public/sw.js` — the service worker: pages from the network first, code and
  recordings from the cache first. Plain JavaScript at a fixed address,
  registered only in the published build

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
npx vitest run          # 259 tests
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

`onset-lab.html` is its companion for the whole microphone loop: it plays the
recordings the way an analyser would deliver them — the newest 4096 samples
every 10 ms — through `core/hearing.ts`, singly, in legato, as repeated notes
and as runs. **Measure changes to the microphone path here, not in
`pitch-lab.html`**: the pitch bench asks about windows that begin at the
strike, and the app never sees one. That difference once hid a loop that named
3 notes of 30. <http://localhost:5173/onset-lab.html>, about a minute to run.

**Deployment is automatic**: a push to `main` runs lint, tests, types and build,
and publishes to <https://felix25192.github.io/piano-trainer/>.

When testing in the built-in browser pane, note that `scrollTo({behavior:
"smooth"})` does not animate while the window is in the background. Patch
`scrollTo` to `behavior: "auto"` in a probe rather than concluding the app is
broken.

## Before changing anything about audio

The device has **one** audio session. Playing back and listening need different
categories and cannot both hold it, on iOS and in a native app alike — the
categories are the operating system's, not the browser's. `core/audioMode.ts`
is that rule and `adapters/audioSession.ts` is the only thing allowed to act on
it. Nothing else may create an `AudioContext`, set `navigator.audioSession.type`
or call `getUserMedia`. One grep keeps that honest:

```bash
grep -rn "new AudioContext\|getUserMedia\|audioSession.type" src mic-test.html
```

Two hits are allowed, and both only ask whether the browser has the thing at
all without touching it: the environment card in `mic-test.html`, and
`MicInput.isSupported`. Anything else is a bug.

This was learnt the hard way. Three places each took the device on their own,
and a day went on fixes that each broke the one before: releasing the
microphone took playback away in silent mode, claiming `playback` for silent
mode took the microphone away. Each was verified on its own and none against
what already worked.

So: **after any change to audio, check all six, not the one that was fixed.**

1. A passage plays.
2. A passage plays with the ring switch set to silent.
3. The device test hears a hummed note.
4. The device test still hears one after a passage was played.
5. A passage still plays after the device test has run.
6. Leaving the page gives the device back — other tabs and apps have sound.

One and five and six can be checked here; two, three and four need the iPad.
Ask for them as one round, not as six separate complaints.

## What works

The app opens on a start screen: one card per mode, and above them the piece
from last time, so sitting down at the piano is one tap. Leaving a score for
it keeps the bar that was reached — within the session; a reload starts at the
top as before.

Scores render as one continuous horizontal staff line, both clefs, correct
accidentals, fitted to the viewport height automatically on every rotation —
up to `ZOOM_FIT_MAX`, past which a single bar would fill the screen and there
would be nothing ahead to read. Tapping the score sets the position. Piece and measure are chosen from the top
bar, and so are the hands: both, right alone or left alone. With one hand
chosen the other stays on the page and is simply not asked for — its notes,
played anyway, are let through rather than marked wrong.

A tied note is asked for once, where it is struck, and passed over where it
is held: a tie is one sound. Striking it again counts as a misreading. The
exception is starting in the middle of one — by tap, by bar, or where a
passage played back stopped — since nothing is sounding yet; there it is
asked for. `demandedPitches` in `core/score.ts` is that rule, and the
matcher and the bar list both use it. Own MusicXML files can be loaded and persist. Exercises are generated for
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

**The microphone plays the app.** A button in the bar under the score hands
the engine over to it, and a note played into the room then moves the
highlight on exactly as a tapped button does — the `NoteInputSource` port
makes them indistinguishable. Monophonic: one note at a time. Chords are the
harder problem and are not done — and both hands sounding together are a
chord too. Every exercise and every bundled piece is written for both hands,
so the microphone is played **one hand at a time**, chosen in the top bar.
Through the real app, fed recordings, a C major scale up and down in legato
came out 15 of 15 in either hand.

It listens for the *strike*, not for what is ringing, and `core/hearing.ts` is
the whole loop. A hundred times a second it asks two cheap questions — did it
get louder, did new partials appear — and only on a strike does the pitch
detection run, 100 ms later, over the newest 46 ms, once the new note has the
window to itself. Measured in `onset-lab.html` against the recordings: 27 of
30 keys out of silence (the top three are missing, far above the repertoire),
26 of 26 second notes in finger legato down to 150 ms apart, 14 of 14 repeated
notes, 8 of 8 in runs up and down, no strike counted twice. With the pedal down
it falls to 12 of 26, because then the old note never stops and every window is
a chord.

Through the real app — adapter, loop, protocol and matcher, fed recordings
instead of a microphone — a C major scale played hand after hand came out 16 of
16.

For the instrument there is an **Anschlagsprotokoll** in the settings: a strip
under the score that lists each strike, what was heard or why it was refused,
what was expected, and the numbers behind it. It names the expected notes and
is off by default for that reason; it exists so that a stuck highlight can be
told apart into "heard nothing" and "heard the wrong thing".

**A deploy no longer leaves the home-screen app black**, and the app works
offline. Each build names its code after its contents and GitHub Pages deletes
the old files, so a standalone app that kept yesterday's `index.html` used to
ask for code that was gone. The service worker in `public/sw.js` asks the
network for the page first and serves code and recordings from its cache,
throwing away code no cached page names any more. All thirty recordings are
fetched when it installs, so even the first passage played back needs no
connection. Verified against a Pages-shaped server: offline the app starts
and plays; after a simulated deploy it loads the new code and drops the old.

Listening and playing back can never both hold the device, and the buttons say
so — each greys the other out while it runs.

The expected notes are deliberately **not** displayed. Naming them turns the
exercise into reading text. A wrong note turns the highlight red instead.
Playing them back is the deliberate exception: it gives the ear something to
aim at and still leaves the eyes the work of finding it on the page.

## What is open

- **Spike A, from the home screen.** In Safari it passed — see What works.
  Launched from the home screen it is still untested, which is where the
  [long-standing WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=185448)
  would bite if it bites at all.
- **Chords through the microphone.** `MicInput` is built and monophonic, which
  is stage one and covers any single line, one hand at a time. Legato with the pedal down is the same problem in small:
  12 of 26 second notes. Two
  notes at once is stage two: not "what is playing", which is unsolved, but
  "are the expected notes there and is nothing foreign among them". Weeks, and
  the adversaries are the pedal, the chord still ringing from before, and the
  partials of a low note landing exactly where a higher expected note sits.
- **The microphone has never heard a real piano.** Everything measured so far
  was a recording pushed through the detector, or a hummed note. The level,
  the room and the attack of an actual instrument are unmeasured.

  The detector is measured against recordings. Against the thirty recordings it gets
  **28 of 30 right in the first 50 ms after the strike** — over a window that
  *begins* at the strike, which the live loop only gets once it waits for it;
  see `onset-lab.html` — and falls to 15 of 30
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
- **The service worker on the device.** Tested against a static server shaped
  like GitHub Pages, not yet on the iPad or from the home screen. And a device
  that still holds an `index.html` from before it existed can go black once
  more, on the first launch after the deploy that brings it — pulling down to
  refresh fixes that one last time.
- **A page holding the microphone silences the device.** On iOS an open
  `getUserMedia` stream puts the whole audio session into record mode, and
  playback then goes quiet or mute — in other tabs and other apps too, not just
  the page holding it. Cost an hour of "did we break the sound?". The test page
  now has a stop button and releases the stream when it is hidden; MicInput
  will have to do the same, and listening and playing back can never overlap.

  The output survives it now rather than pretending: `SampledPiano` awaits
  `resume()`, checks the state afterwards, and throws the context away and
  builds a new one if it will not come back. A context Safari has parked keeps
  a clock that does not advance, so everything scheduled against it is silent
  while the app believes it is playing — failure that looks like working. The
  shell watches for that too and says so after two seconds instead of leaving
  the stop button lit forever.
- **Playback on iOS**: the app now claims the `playback` audio session, so the
  ring switch no longer silences it — Safari files a bare AudioContext under
  `ambient`, which that switch mutes outright. Safari 16.4 and later only;
  below that the switch keeps the last word. Untested on the device so far.
  The behaviour from the home screen is untested too, same class of unknown as
  Spike A.
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
reach the iPad through a native wrapper. On the `ios-spike` branch that
wrapper exists: Capacitor 8, built unsigned by GitHub Actions on macOS since
there is no Mac here, with its own CoreMIDI bridge in `native/midi-bridge`.
It compiles; it has never run. Signing needs an Apple Developer account.

## History

`docs/PLAN.md` is the running log, newest sections last, each dated and each
explaining why a decision went the way it did. Commit messages carry the same
reasoning. Both are worth reading before changing something that looks odd —
it usually looks odd for a reason that is written down.
