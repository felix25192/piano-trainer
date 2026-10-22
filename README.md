# Piano Trainer

A sight-reading trainer for piano. Sheet music scrolls horizontally while you
play; it advances only when you play the correct note, and stops when you
don't. The goal is to practise reading notation *at the instrument*, rather
than memorising pieces by ear.

**Live:** <https://felix25192.github.io/piano-trainer/> — made for a tablet in
landscape on the music stand, and runs in any current browser.

## Why

Existing apps are subscription-based and optimise for engagement — streaks,
points, levels. This one optimises for one thing only: reading fluency.
No accounts, no gamification, no pressure.

## What it does

- **One continuous line of music**, both clefs, correct accidentals, sized to
  the screen on every rotation. Tap the score to start anywhere, or pick a bar.
- **The right note moves it on, a wrong one turns it red.** The expected notes
  are never named: that would turn reading notation into reading text.
- **Unfamiliar material**, because a piece you know by ear lets memory do the
  reading. Seven graded public-domain pieces, from a Bach minuet to the
  Moonlight Sonata, and any MusicXML file of your own, kept on the device.
- **Generated exercises**: scales, arpeggios and five-finger patterns in twelve
  major and twelve harmonic minor keys, one to four octaves, parallel or
  contrary motion, with fingerings for major.
- **Hands separately or together.** A tied note is asked for once, where it is
  struck.
- **Hear a passage first**, played back from the highlight at the written
  tempo, 75 % or half, with recordings of a real grand piano and the damper
  pedal where the score writes it.
- **Played through the microphone**, one note at a time — and so one hand at a
  time.
- **Works offline** once it has been opened.

## Musical correctness

Pitches are carried as letter, alteration and octave, never as a bare MIDI
number. In D major the third degree is F sharp, never G flat; G sharp minor
raises its seventh to F double sharp. Anything that computes in semitones
writes nonsense at exactly those places, and the tests name them.

Where a musical fact is uncertain it is left out rather than guessed. There
are no minor-key fingerings yet: they do not simply follow the parallel or
relative major, and a wrongly practised fingering is harder to unlearn than
none.

## How it listens

Asking "which notes are sounding?" is polyphonic transcription, a hard
problem. The app asks a narrower one: was a note struck, and is it the one
expected?

A hundred times a second, two cheap tests look for a strike — did it get
louder, and did new partials appear in the spectrum. Only then does the costly
part run: pitch detection (YIN), 100 ms after the strike, over the newest 46
ms, once the new note has the window to itself. The pitch is detected over the
whole range and compared with the expected note afterwards. Searching only
near the expected note is four times faster, and it waves through 24 of 26
octave errors.

Measured on the test bench, `onset-lab.html`, against thirty recordings of a
real grand piano:

| Case | Result |
|---|---|
| Single notes out of silence | 27 of 30 — the missing three are the top keys |
| Finger legato, notes 150 ms apart | 26 of 26 |
| Repeated notes | 14 of 14 |
| Runs up and down | 8 of 8 |
| Legato with the pedal down, 300 ms apart | 12 of 26 |
| Strikes counted twice | none |

With the pedal down the old note never stops, so every window holds a chord.
That is the next problem, not a solved one.

## Architecture

Ports and adapters, dependencies pointing inward.

```
src/core/       Pure TypeScript: theory, scores, the matching engine, pitch
                and onset detection. No React, no DOM, no browser. Tested.
src/adapters/   One external thing each: OSMD, Web Audio, the microphone,
                Web MIDI, IndexedDB. Deliberately thin.
src/App.tsx     The shell. Subscribes; does not think.
```

Every input implements one port, `NoteInputSource`, so the engine cannot tell
a microphone from a keyboard. Generated exercises are serialised to MusicXML
and loaded like a file from disk, so they travel exactly the same path as a
real score.

## What is open

- **The microphone has never heard a real piano.** Everything above was
  measured against recordings. A test round at two instruments comes next —
  see [`docs/TESTRUNDE.md`](docs/TESTRUNDE.md).
- **Chords through the microphone** are not done, and both hands sounding
  together are a chord too.
- **MIDI.** An adapter for Web MIDI exists but is not wired into the interface
  yet. Safari has no Web MIDI at all, so an iPad needs a native shell; one
  exists on the `ios-spike` branch, built by GitHub Actions without a Mac. It
  compiles and has never run.
- Dynamics are ignored when playing back.

[`docs/PLAN.md`](docs/PLAN.md) is the running log, in German: every decision,
dated, with the reason it went the way it did.

## Running it

```bash
npm install
npm run dev     # the app, at http://localhost:5173
npm test        # the tests
npm run build   # type check, then the production build
```

`mic-test.html` is the device test the start screen links to: it checks
whether a phone or tablet can supply microphone input at all. `model-test.html`
times a chord-hearing model on the device itself. Three benches run in the dev
server only and are never published: `pitch-lab.html` for the pitch detector,
`onset-lab.html` for the whole listening loop, and `chord-lab.html` for models
that might hear both hands.

A push to `main` runs lint, tests, types and build, and publishes to GitHub
Pages.

## Licence

None. All rights reserved.

The source is public so it can be read — this is a personal learning project
and a portfolio piece. That is not permission to reuse it. If you want to use
any of it, ask.

Not mine, and not covered by this:

- **The seven scores** in `public/scores/`. The compositions are public domain,
  the transcriptions are other people's work; see
  [`public/scores/SOURCES.md`](public/scores/SOURCES.md).
- **The piano recordings** in `public/piano/`: the Salamander Grand Piano by
  Alexander Holm, under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); see
  [`public/piano/SOURCES.md`](public/piano/SOURCES.md).
