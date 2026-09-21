# Projektplan

Stand: 21.09.2026

## Ziel

Eine App zum Notenlesen-Lernen am Klavier. Noten laufen horizontal durch,
zwei bis drei Takte gleichzeitig sichtbar, Violin- und Bassschlüssel. Die
Anzeige schaltet weiter, sobald der richtige Ton gespielt wurde, und bleibt
bei einem falschen Ton stehen.

Kein Belohnungssystem, keine Streaks, kein Konto. Nur Notenlesen.

## Hardware

- **Kawai ES520** — USB to Host (USB-MIDI, klassenkonform, kein Treiber
  nötig), zusätzlich Bluetooth MIDI. Keine USB-Audioschnittstelle, über USB
  kommen nur Notendaten.
- Zweitinstrument: akustisches Klavier → hierfür ist das Mikrofon der einzige
  Weg.
- Zielgerät zum Üben: iPad / iPhone.
- Entwicklungsrechner: Windows 11, keine Admin-Rechte.

## Recherchierte Randbedingungen

Diese Punkte wurden geprüft, nicht angenommen:

1. **Safari unterstützt kein Web MIDI.** Weder auf iOS noch auf macOS, in
   keiner Version bis einschließlich 27. Chrome, Edge und Firefox können es.
   → In der Web-App ist MIDI nur am Desktop verfügbar. Auf dem iPad bleibt
   das Mikrofon — oder später eine native App mit CoreMIDI-Brücke.

2. **Mikrofonzugriff in Homescreen-Web-Apps auf iOS ist unzuverlässig.**
   WebKit-Fehler 185448, seit Jahren offen, Berichte je nach iOS-Version
   unterschiedlich. → Muss früh getestet werden. Notfalls läuft die App im
   normalen Safari-Tab.

3. **MusicXML ist das richtige Eingabeformat.** Es trennt Tonhöhe von
   Notation und enthält Vorzeichen, enharmonische Schreibung, Stimmen und
   Balkung. MIDI kennt nur Tastennummern — daraus korrekten Notensatz zu
   erzeugen wäre Raten. Gescannte PDFs bräuchten Notenerkennung (OMR), ein
   eigenes Forschungsfeld mit unzuverlässigem Ergebnis.

4. **Quellen für gemeinfreie MusicXML-Dateien:** OpenScore (CC0, Partnerschaft
   von MuseScore und IMSLP), Mutopia, github.com/musetrainer/library.
   Konkrete Beschaffung der Mondschein-Sonate steht noch aus.

## Zentrale Entscheidungen

### Web-Technologie, nicht nativ

Die einzigen ausgereiften Notensatz-Bibliotheken leben im Web-Ökosystem
(VexFlow, OpenSheetMusicDisplay, abcjs). Ein natives React-Native-Projekt
bräuchte für die Noten trotzdem eine WebView und hätte damit die Komplexität
von beidem. Capacitor verpackt später denselben Code nach iOS und Android.

### Engine ohne Framework

Notenmodell, Eingabeverarbeitung und Abgleichlogik sind reines TypeScript,
ohne React und ohne DOM. Die Oberfläche hört nur zu.

Gründe: testbar ohne Browser; eine Audioschleife mit 50 Hz reißt nicht die
Oberfläche in Stücke; beide Eingabewege stecken hinter derselben Schnittstelle.

```ts
interface NoteInputSource {
  start(): Promise<void>;
  onNoteOn(cb: (n: { midi: number; time: number }) => void): void;
}
```

### Verifikation statt Transkription

Das Mikrofon-Modul fragt nie "welche Töne werden gerade gespielt?" — das wäre
polyphone Transkription, ein ungelöstes Problem. Es fragt "sind die erwarteten
Töne da, und klingt nichts Fremdes dazwischen?". Das ist Spektralanalyse mit
harmonischen Vorlagen und Schwellenwerten.

### MIDI als Entwicklungslabor

Am Desktop liefert Web MIDI exakte Tastenanschläge. Damit wird die App
vollständig gebaut, bevor Signalverarbeitung überhaupt beginnt. Danach dient
MIDI als Referenzquelle: dieselbe Passage über MIDI und Mikrofon gleichzeitig
aufnehmen und die Erkennungsergebnisse vergleichen.

## Modulstruktur

```
score/      MusicXML laden, Notenmodell, "was wird als nächstes erwartet"
render/     OSMD-Wrapper, horizontales Scrollen, Cursor
input/      NoteInputSource-Schnittstelle
            ├─ MidiInput   (Desktop, exakt)
            └─ MicInput    (iPad, Spektralanalyse)
match/      Abgleich erwartet vs. gespielt, Fortschritt, Fehlerzustand
practice/   Session-Steuerung, Tonleiter-Generator
ui/         React-Komponenten
```

## Phasen

### Phase 0 — Risiken abklopfen
Bevor irgendetwas gebaut wird:
- **Spike A:** Mikrofonzugriff auf dem iPad testen, im Safari-Tab *und* als
  Homescreen-App. Klärt Randbedingung 2.
- **Spike B:** OSMD mit echter MusicXML-Datei, ein System, horizontal
  scrollbar. Klärt das größte Rendering-Risiko.
- Mondschein-Sonate als MusicXML beschaffen.

### Phase 1 — Noten auf dem Schirm
MusicXML laden, korrekt gesetzt mit beiden Schlüsseln und richtigen
Vorzeichen. Zwei bis drei Takte sichtbar. Cursor per Leertaste weiter.

Bereits hier nutzbar: mitlesen im eigenen Tempo. Kein Instrument nötig.

### Phase 2 — MIDI-Eingabe
`NoteInputSource` und `MidiInput`. Abgleichlogik: ein Akkord gilt als richtig,
wenn alle erwarteten Töne vorhanden sind. Richtig → weiter, falsch → stehen
bleiben und Stelle markieren.

Danach ist die App funktional vollständig — am Desktop, mit Kabel.

### Phase 3 — Mikrofon
AudioWorklet mit Ringpuffer. Erst einstimmig (YIN oder MPM), damit laufen
Tonleitern. Dann Akkordprüfung über FFT und harmonische Vorlagen der
erwarteten Töne. Kalibrierung für Grundrauschen und Empfindlichkeit.
Gegner: Pedal, Nachklang, Obertöne, Resonanz.

Aufwand in Wochen, nicht Tagen.

### Phase 4 — Übungen und Komfort
Tonleitern und Fingerübungen programmatisch erzeugen statt als Dateien
ablegen: eine Funktion, die aus Tonart, Umfang und Muster ein Notenmodell
baut. Bibliothek mehrerer Stücke, Abschnitte üben (Takt X bis Y).

### Phase 5 — Native App
Capacitor nach iOS und Android. Dort steht auch Bluetooth MIDI offen —
iPad auf dem Notenpult, ES520 kabellos, exakte Erkennung ohne Mikrofon.

## Offene Fragen

- Wie verhält sich das horizontale Endlos-Scrollen mit OSMD? (Spike B)
- Wird der Rhythmus bewertet oder nur die Tonfolge? Aktuell: nur Tonfolge,
  die Anzeige folgt dem Spieler, nicht einem Metronom.
- Wie wird mit Verzierungen, Trillern und Pedalangaben umgegangen?

---

## Spike-Ergebnisse (21.09.2026)

### Spike B — Notenrendering: bestanden

OSMD 2.1.3 mit `EngravingRules.RenderSingleHorizontalStaffline = true`
setzt eine komplette Partitur als eine durchgehende horizontale Zeile.
Damit ist das größte Risiko des Projekts vom Tisch.

Geprüft an Beethoven Op. 27 Nr. 2, 1. Satz:

| Prüfpunkt | Ergebnis |
|---|---|
| Violin- und Bassschlüssel übereinander, mit Klammer | korrekt |
| Vier Kreuze in beiden Systemen | korrekt |
| Triolen mit Zahl und Balkung | korrekt |
| Taktsymbol alla breve (¢) | korrekt |
| Dynamik und Beethovens Spielanweisung | vorhanden |
| Cursor schaltet Note für Note weiter | funktioniert |
| Erwartete Töne als MIDI-Nummern auslesbar | funktioniert |
| Seitliches Mitlaufen beim Weiterschalten | funktioniert |

Stichprobe der Tonhöhen gegen die Partitur:
- Takt 1: gis (56), cis (37), cis (49) — Auftakt-Triole und Bassoktave
- Takt 3: gis (56), h (35), h (47) — Bass wechselt auf H

Der Zugriff läuft über `osmd.cursor.NotesUnderCursor()`. Die
MIDI-Nummer ergibt sich aus `Pitch.getHalfTone() + 12`. Das ist die
Schnittstelle, an der später die Abgleichlogik andockt.

### Korrektur zur Taktart

Frühere Notiz war unvollständig: Die Datei enthält `<time symbol="cut">`,
das Taktsymbol wird also richtig als ¢ dargestellt. Lediglich die
darunterliegende Zählzeit steht auf 4/4 statt 2/2 — eine Eigenheit von
MuseScore 2. Für Notenlesen ohne Rhythmusbewertung ohne Bedeutung;
relevant erst bei Metronom oder Timing-Auswertung.

### Offen aus Phase 0

- **Spike A** (Mikrofonzugriff auf dem iPad) steht noch aus, braucht das Gerät.
- Darstellungsgröße: aktuell sind deutlich mehr als 2–3 Takte im Bild.
  OSMD bietet `osmd.zoom` — gehört in Phase 1.

---

## Kern gebaut (22.09.2026)

Aus dem Architekturbild ist Code geworden. Der Kern liegt in `src/core/`
und hat keine einzige Abhängigkeit zu React, OSMD, Audio oder DOM.

| Datei | Aufgabe |
|---|---|
| `core/pitch.ts` | MIDI-Nummern, Notennamen, Frequenzen, Cent-Abweichung |
| `core/score.ts` | Notenmodell: Schritte, erwartete Töne, Takte |
| `core/NoteInputSource.ts` | **Der Port.** Die Schnittstelle, über die gespielte Töne hereinkommen |
| `core/NoteMatcher.ts` | Abgleichlogik: richtig → weiter, falsch → stehen bleiben |
| `adapters/osmdScore.ts` | Übersetzt OSMDs Objektgraph ins Notenmodell |

**39 Tests, alle grün.** Getestet wird ausschließlich der Kern — Adapter
bleiben absichtlich dünn genug, dass dort nichts zu testen ist.

### Verhalten des Abgleichs

- Ein Akkord gilt erst als gespielt, wenn **alle** erwarteten Töne da sind,
  Reihenfolge egal.
- Ein falscher Ton hält an und setzt einen Fehlerzustand. Bereits richtig
  gespielte Töne des Akkords bleiben erhalten — man muss nicht von vorn
  anfangen.
- Der nächste richtige Ton löscht den Fehler.
- Pausen brauchen keine Eingabe und werden übersprungen. Diese Regel steht
  an genau einer Stelle (`skipSilent`).
- Eine Vertrauensschwelle filtert unsichere Erkennungen weg. MIDI meldet
  immer 1, die Schwelle betrifft also nur das Mikrofon — der Kern weiß
  trotzdem nichts über Audio.
- Derselbe Ton in beiden Systemen notiert ist **eine** Taste, nicht zwei.

### Offene Frage aus den Tests

Liegt eine gemessene Frequenz exakt zwischen zwei Tasten (50 Cent), ist
keine Antwort richtiger als die andere. `Math.round` rundet nach oben; das
ist jetzt per Test festgeschrieben, damit es eine Entscheidung ist und kein
Zufall. Der Mikrofon-Adapter sollte so weit verstimmte Töne ohnehin
verwerfen.

### Noch nicht gelöst

- **Gebundene und gehaltene Töne.** Wird ein Ton über den Taktstrich
  gehalten, kommt kein neues MIDI-Ereignis. Der Abgleich würde warten.
- **Vorausspielen.** Wer den nächsten Ton zu früh anschlägt, bekommt
  aktuell "falsch". Ob das richtig ist, muss die Praxis zeigen.
- **Verzierungen und Triller** sind im Notenmodell ganz normale Schritte.
