# Piano Trainer

A sight-reading trainer for piano. Sheet music scrolls horizontally while you
play; it advances only when you play the correct note, and stops when you
don't. The goal is to practise reading notation *at the instrument*, rather
than memorising pieces by ear.

## Why

Existing apps are subscription-based and optimise for engagement — streaks,
points, levels. This one optimises for one thing only: reading fluency.
No accounts, no gamification, no pressure.

## Status

Early development, but the hard parts are answered.

Scores render as one continuous horizontal staff line with both clefs and
correct accidentals, and the engine knows which notes it is waiting for at
every position. Chords require every note before the cursor moves; a wrong
note stops it. No instrument is attached yet — two buttons stand in for one
while the MIDI adapter waits for a cable.

```bash
npm install && npm run dev   # the app
npm test                     # 39 tests over the engine
```

Open `/mic-test.html` on a phone or tablet to check whether that device can
supply microphone input at all.

## Planned approach

| Concern | Approach |
|---|---|
| Score format | MusicXML (correct accidentals, voicing and enharmonics — unlike MIDI) |
| Rendering | [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/) on VexFlow |
| Note input | Two sources behind one interface: Web MIDI (desktop) and microphone (iPad) |
| Pitch matching | Verification against expected notes, not full polyphonic transcription |
| Platform | Web app first (runs on iPad today), native via Capacitor later |

The engine — score model, input handling, note matching — is plain TypeScript
with no framework dependency. The UI subscribes to it.

See [`docs/PLAN.md`](docs/PLAN.md) for the full roadmap and the reasoning
behind these decisions.

## Licence

None. All rights reserved.

The source is public so it can be read — this is a personal learning project
and a portfolio piece. That is not permission to reuse it. If you want to use
any of it, ask.

The two sheet music files under `public/scores/` are not mine and are not
covered by this; see [`public/scores/SOURCES.md`](public/scores/SOURCES.md).
