# Where these files came from

The compositions are public domain — Beethoven's Op. 27 No. 2 was published in
1802, Clementi's Op. 36 in 1797. What follows concerns the *transcriptions*,
which are modern work by other people.

## moonlight-sonata-mvt1.mxl

- Retrieved from [musetrainer/library](https://github.com/musetrainer/library),
  which describes itself as a collection of public domain MusicXML files.
- The file's own metadata names its origin as
  `musescore.com/classicman/scores/55352`, encoded with MuseScore 2.2.1 on
  2018-04-22.
- The repository carries no explicit licence file. The transcription is
  therefore used here in good faith as a public domain edition, for a personal
  practice tool.

Known deviation from an urtext edition: the time signature is marked
`<time symbol="cut">` — so it *displays* correctly as alla breve — but the
underlying meter is encoded as 4/4 rather than 2/2. A MuseScore 2 quirk.
Irrelevant for reading practice; relevant if rhythm or a metronome is added.

## clementi-sonatina-op36-no1.xml

- Retrieved from the test fixtures of
  [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay),
  which is BSD-3 licensed.

## If you are reusing this repository

These two files are here so the app runs straight after cloning. They are not
part of the software and are not covered by its licence. If their provenance
matters for your purposes, replace them with editions whose licensing you have
verified yourself — the app loads any MusicXML or compressed MusicXML file.

---

## Added 22.09.2026 — a graded set for sight-reading

All five retrieved from
[musetrainer/library](https://github.com/musetrainer/library), same provenance
and same licensing caveat as the Moonlight file above: the compositions are
public domain, the transcriptions are MuseScore user work under no stated
licence.

Each was checked against the score before being added — key signature, clefs,
staff count, time signature and bar count.

| File | Checked |
|---|---|
| `bach-minuet-g-bwv-anh114.mxl` | G major (1 sharp), 3/4, 32 bars, 2 staves — matches |
| `beethoven-danse-villageoise.mxl` | D major (2 sharps), 3/4, 61 bars, 2 staves — internally consistent |
| `bach-prelude-c-bwv846.mxl` | C major, 4/4, **34 bars** — see below |
| `mozart-sonata-k545-mvt1.mxl` | C major, 4/4, 73 bars — matches |
| `chopin-nocturne-cs-minor-posth.mxl` | 4 sharps, 4/4, 65 bars — see below |

### The Chopin file was misnamed at the source

It arrives as `Nocturne_No._20_in_C_Minor.mxl`, but the key signature carries
four sharps and the opening notes are E, G sharp, C sharp. That is the
**Nocturne in C sharp minor, Op. posth.** — C minor would be three flats.
Renamed here to match what the file actually contains.

### The Bach prelude is one bar short

BWV 846's prelude has 35 bars in Bach's autograph. Editions carrying the
so-called "Schwencke measure" — a bar inserted between 22 and 23 by a
19th-century editor, and demonstrably not Bach's — have 36. This file has 34,
so it is short of the authentic text rather than following a variant.

Which bar is missing has not been established. For reading practice the loss
of one bar is harmless; for learning the piece, use a proper edition.
