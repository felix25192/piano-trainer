# Where these recordings came from

Thirty MP3 files, one every minor third from A0 to C8. They are what the app
plays a passage back with.

## Salamander Grand Piano

- **Author: Alexander Holm.** A Yamaha C5 grand, recorded with two AKG C414
  microphones in an AB pair about 12 cm above the strings, at 48 kHz / 24 bit.
- **Licence: [Creative Commons Attribution 3.0](http://creativecommons.org/licenses/by/3.0/).**
  Attribution is therefore required, and the app carries it in its settings
  panel as well as here.
- Retrieved from <https://tonejs.github.io/audio/salamander/>, the sample
  collection published by the [Tone.js](https://github.com/Tonejs/audio)
  project. Its `salamander/README` names the author and the licence; that file
  is the source for everything above.

The full set has sixteen velocity layers and chromatic release samples. What
Tone.js publishes, and what is here, is one layer of it — thirty notes, every
minor third, which is the spacing Holm recorded at.

## What was changed

CC-BY asks that changes be stated, and there are two, both made in the browser
at load time rather than to the files themselves — what is in this folder is
byte for byte what was retrieved:

- **Folded to mono and cut to twelve seconds.** Decoded in full the set costs
  142 MB of memory, which is enough to get the tab thrown away on a tablet.
  See `MAX_SAMPLE_SECONDS` in `src/adapters/SampledPiano.ts`.
- **Pitched up or down by up to a semitone**, to reach the notes between the
  recordings.

## If you are reusing this repository

These files are not part of the software and are not covered by its licence.
They are Alexander Holm's work under CC-BY 3.0; keep the attribution if you
keep the recordings.
