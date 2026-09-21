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

Early development. Nothing works yet.

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

Not yet decided.
