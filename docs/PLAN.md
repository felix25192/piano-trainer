# Projektplan

Stand: 22.09.2026

> **Wie diese Datei zu lesen ist:** Unten stehen die Abschnitte in der
> Reihenfolge ihrer Entstehung, jeder datiert. Zum Einsteigen reicht dieser
> Kopf und `CLAUDE.md`; der Rest ist Begruendung und wird interessant,
> sobald etwas seltsam aussieht.

## Wo wir stehen

**Fertig und im Einsatz.** Noten laufen als eine horizontale Zeile durch,
beide Schluessel, richtige Vorzeichen, Groesse passt sich der Bildschirmhoehe
selbst an. Antippen setzt die Spielposition. Stueck und Takt sind aus der
Kopfzeile waehlbar. Eigene MusicXML-Dateien lassen sich laden und bleiben
erhalten. Sieben gestufte Stuecke sind dabei. Der Generator erzeugt
Tonleitern, Arpeggien und Fuenf-Finger-Uebungen in vierundzwanzig Tonarten,
ein bis vier Oktaven, parallel oder in Gegenbewegung.

Veroeffentlicht unter <https://felix25192.github.io/piano-trainer/>, bei
jedem Push auf `main` automatisch aktualisiert. 160 Tests.

**Als Naechstes.** Spike A, sobald iPad und Klavier zusammen verfuegbar sind.
Danach MicInput, der dickste verbleibende Brocken. Die offenen Punkte im
Einzelnen stehen in `CLAUDE.md`.

**Noch nie getestet:** die App am echten Instrument. Bis das passiert ist,
sind alle Aussagen ueber das Spielgefuehl Vermutungen.

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

## MIDI-Adapter und Spike-A-Testseite (22.09.2026)

`adapters/MidiInput.ts` implementiert den Port über die Web MIDI API.
Rund achtzig Zeilen, und der Kern merkt nicht, dass er sie benutzt.

Zwei Eigenheiten, die im Code stehen, weil sie sonst Zeit kosten:
- Die meisten Klaviere — auch die Kawai-ES-Reihe — beenden einen Ton mit
  *note-on und Anschlagstärke null* statt mit einem echten note-off. Wer
  nur auf das Statusbyte schaut, bekommt doppelte Anschläge.
- `sysex: false` beim Anfordern der Berechtigung, sonst erscheint eine
  deutlich abschreckendere Rückfrage im Browser.

`public/mic-test.html` ist die Testseite für Spike A: eigenständig, ohne
Build, aufrufbar unter `/mic-test.html`. Sie prüft sicheren Kontext,
getUserMedia, AudioContext, AudioWorklet, Web MIDI und ob die Seite vom
Homescreen aus läuft — und erkennt danach live Tonhöhen per
Autokorrelation.

**Noch offen: auf dem iPad aufrufen.** Dafür muss der Entwicklungsserver
im WLAN erreichbar sein (`vite --host`), was die Firmen-Firewall
blockieren könnte.

## Oberflaeche fuer das Querformat (22.09.2026)

Genutzt wird die App auf iPhone und iPad **im Querformat**. Damit ist die
Hoehe der Engpass, nicht die Breite — genau umgekehrt zur ersten Annahme.

Zweite Einsicht: **Beim Ueben wird der Bildschirm nicht angefasst.** Beide
Haende liegen auf den Tasten, das Instrument treibt die App. Die Bedienung
darf also klein und am Rand bleiben; der Platz gehoert den Noten.

Daraus folgte der Umbau:
- Eine schlanke Leiste haelt Stueck, Takt und die erwarteten Toene. Die
  frueheren drei Leisten frassen 170 von 375 Pixeln Hoehe.
- Bedienelemente touch-tauglich: 48 Pixel Mindesthoehe, `touch-action:
  manipulation` gegen das Doppeltipp-Zoomen, Safe-Area-Raender fuer Notch
  und Home-Indikator.
- Einstellungen liegen in einem Blatt von unten statt dauerhaft im Bild.

### Notengroesse passt sich selbst an

`applyFit()` rendert, misst die entstandene Systemhoehe und korrigiert den
Zoom, bis ein System genau die verfuegbare Hoehe fuellt. OSMD kennt kein
Viewport-Konzept, also ist Messen und Nachkorrigieren der einzige Weg. Feste
Raender sorgen dafuer, dass ein Durchgang untertrifft — die Schleife
konvergiert nach zwei bis drei.

Ein ResizeObserver wiederholt das beim Drehen des Geraets.

Nebeneffekt, der die Anforderung "2-3 Takte" von selbst erfuellt: Die Hoehe
bestimmt die Notengroesse, die Notengroesse bestimmt, wie viele Takte in die
Breite passen. Auf iPad-Massen (1180x820) sind es zweieinhalb Takte bei
grossen Noten, auf einem Handy im Querformat rund fuenf bei kleineren. Das
ist die richtige Kopplung, keine Einstellung noetig.

### Platz zurueckgewonnen

`tightenForScreen()` entfernt die Druck-Annahmen: Seitenraender auf null,
dazu `RenderFirstTempoExpression` und `MetronomeMarksDrawn` aus. Beide
setzen ein Band ueber dem ersten System, das alle folgenden Systeme erben —
ein einziges "Allegro" in Takt 1 verkleinerte jede Note im ganzen Stueck.

### Offen: das Band zwischen den Systemen

Im SVG nachgemessen: Die Dynamikzeichen (p, f, cresc.) liegen bei y≈266-308,
also im Zwischenraum der beiden Systeme, und OSMD reserviert diese Hoehe
ueber das ganze Stueck — auch dort, wo keine Dynamik steht. Einen Schalter
dagegen gibt es in den EngravingRules nicht (`RenderFirstTempoExpression`
ja, Dynamik nein).

Zielkonflikt: Hauptziel ist Notenlesen, dafuer waere der Platz besser in
groesseren Noten angelegt. Dynamik gehoert aber zum richtigen Lesen dazu.
Zu entscheiden, wenn die App auf dem echten Geraet ausprobiert wurde.

## Antippen, um von dort zu spielen (22.09.2026)

Beim Ueben wiederholt man eine schwierige Stelle, nicht den Anfang. Ein Tipp
auf eine Note setzt die Position jetzt dorthin.

### Warum relative Positionen statt Pixel

Beim Einlesen laeuft der Cursor ohnehin einmal durch die ganze Partitur.
Dabei notiert `extractScore` zusaetzlich, an welchem **Bruchteil der
Gesamtbreite** jeder Schritt sitzt — nicht an welchem Pixel.

Pixel waeren beim naechsten Neuzeichnen falsch, und neu gezeichnet wird bei
jeder Drehung des Geraets und bei jeder Zoomaenderung. Verhaeltnisse
ueberstehen das, weil OSMD das gesamte Layout gleichmaessig skaliert. Aus
einem Verhaeltnis wieder eine Pixelposition zu machen ist eine
Multiplikation mit der aktuellen Breite.

Damit entfaellt auch OSMDs Einheitenrechnung samt `unitInPixels` und
`GetNearestNote` vollstaendig.

### Kosten im Griff

Die Position wird aus `cursorElement.style.left` gelesen, nicht aus
`offsetLeft`. Das Attribut setzt OSMD selbst, und eine Zeichenkette zu lesen
kostet nichts — `offsetLeft` wuerde den Browser bei jedem von mehreren
hundert Schritten zu einem neuen Layout zwingen. Die Breite des Blattes wird
einmal vor dem Durchlauf gemessen.

### Wischen ist kein Tippen

Eine Geste zaehlt nur als Tippen, wenn sich der Finger weniger als zehn
Pixel bewegt hat. Sonst wuerde jedes seitliche Blaettern die Spielposition
verstellen.

### Neu im Kern

`NoteMatcher.seekToStep(index)` klemmt statt abzulehnen — die Eingabe kommt
von einem Finger auf Glas, und einen Tipp zwei Pixel hinter der letzten Note
zurueckzuweisen waere schlechter, als beim naechstgelegenen anzufangen.
Landet der Tipp auf einer Pause, geht es zum naechsten spielbaren Schritt.

`stepAtFraction()` ist reine Suchlogik ohne OSMD-Bezug und daher getestet,
inklusive der Faelle, die ein Touchscreen produziert: Tipp zwischen zwei
Noten, exakt auf der Mitte, vor dem Anfang, hinter dem Ende, und auf einen
Akkord, dessen Toene alle an derselben Stelle sitzen.

53 Tests, alle gruen.

## Der Cursor deckt jetzt das ganze System ab (22.09.2026)

OSMD bemisst den Markierungsbalken allein an den Notenlinien. Noten auf
Hilfslinien — die Bassoktave am Anfang der Mondscheinsonate zum Beispiel —
lagen dadurch ausserhalb und sahen abgeschnitten aus.

Ein fester Vergroesserungsfaktor loest das nicht, weil von Stueck zu Stueck
verschieden ist, wie weit Noten ueber die Linien hinausreichen. `stretchCursor()`
misst daher: Transform loeschen, natuerliche Hoehe ablesen, daraus den Faktor
berechnen, der das gesamte System abdeckt. Skaliert wird um die Mitte, damit
der Ueberstand oben und unten gleich ausfaellt.

Nachgemessen mit `svg.getBBox()`: Die Zeichenflaeche ist ueber das ganze
Stueck hinweg eng an den Inhalt gelegt. Volle Systemhoehe ist also nicht zu
viel, sondern das Minimum, bei dem an keiner Stelle des Stuecks eine Note
herausragt. Lokal wirkt der Balken dadurch hoeher als noetig — dafuer bleibt
er konstant, statt bei jedem Schritt zu zappeln.

Umgesetzt ueber `transform`, weil OSMD bei jeder Cursorbewegung `top` und
`left` neu schreibt, `transform` aber unberuehrt laesst. Der Aufruf sitzt in
`restoreCursor()`, damit kein Zeichenpfad ihn vergessen kann.

Dazu ein weicher Uebergang der Position (120ms), der dem Auge das Folgen
erleichtert.

## Eigene Stuecke laden (22.09.2026)

### Erwartete Noten nicht mehr anzeigen

Stand die naechste Note als Text im Bild, liest man den Text statt der Noten.
Der Trainingseffekt war der ganze Zweck. Geblieben ist das Signal ohne die
Antwort: Bei einem falschen Ton wird der Markierungsbalken rot — man merkt,
dass es an einem selbst liegt und die App nicht haengt, erfaehrt aber nicht,
was richtig gewesen waere.

### OSMD nimmt ein Blob

`load(content: string | Document | Blob)`. Eine Datei aus einem Auswahlfeld
*ist* ein Blob, also brauchen `.xml`, `.musicxml` und `.mxl` keine
Sonderbehandlung und nichts muss selbst entpackt werden.

### Ablage in IndexedDB, nicht localStorage

IndexedDB haelt ein Blob wie es ist. localStorage muesste die Datei
base64-kodiert als Zeichenkette fuehren, was sie um ein Drittel aufblaeht und
gegen ein Kontingent von wenigen Megabyte drueckt. Eine gepackte Partitur
liegt bei Zehnern von Kilobyte, eine ungepackte bei mehreren hundert — ein
Regal voller Stuecke wuerde anstossen.

Was dagegen *in* localStorage gehoert: welches Stueck zuletzt offen war. Eine
kurze Zeichenkette, und geht sie verloren, kostet es einen Tipp.

### Ein Reihenfolgefehler, der Zeit gekostet haette

Das Merken der Auswahl hing zuerst an einem Effekt auf `selected`. Der
feuert beim Mounten einmal mit dem Standardwert — und ueberschreibt damit
genau den Wert, den die Wiederherstellung gleich lesen will, weil die
Stueckliste asynchron eintrifft.

Jetzt haengt das Speichern an der Handlung, nicht am Zustand: `choosePiece()`
setzt und merkt in einem, und alle Auswahlpfade laufen darueber.

### Aufteilung

- `core/scoreFile.ts` — was als Notendatei gilt und wie sie heisst. Reine
  Zeichenkettenarbeit, getestet: Endungen, Pfadreste, Unterstriche der
  Notenseiten, der Abkuerzungspunkt in `Arrg..mxl`, leere Namen.
- `adapters/scoreLibrary.ts` — IndexedDB. Keine Entscheidungen, nur Ablage.

65 Tests, alle gruen.

### Offen

- Ein Titel aus der Datei selbst waere besser als einer aus dem Dateinamen;
  viele Partituren tragen einen.
- Speicherplatz wird nicht begrenzt. Bei Dutzenden Stuecken waere eine
  Anzeige des Verbrauchs sinnvoll.

## Ein gestuftes Uebungsset (22.09.2026)

Sieben mitgelieferte Stuecke, leichtestes zuerst, jedes mit einem Hinweis in
der Liste. Ausgewaehlt **zum Lesen, nicht zum Spielen** - entscheidend ist
Abwechslung pro Takt und vor allem Unbekanntheit. Ein Stueck, das man im Ohr
hat, laesst das Gedaechtnis arbeiten, waehrend die Augen nichts lernen. Genau
deshalb kann jemand die Mondscheinsonate auswendig und trotzdem keine Noten
lesen.

Jede Datei wurde vor der Aufnahme gegen die Partitur geprueft: Vorzeichen,
Schluessel, Systemzahl, Taktart, Taktzahl. Zwei Befunde dabei:

### Die Chopin-Datei war an der Quelle falsch benannt

Sie heisst dort `Nocturne_No._20_in_C_Minor.mxl`. Die Tonart traegt aber vier
Kreuze und die ersten Toene sind e, gis, cis - das ist die **Nocturne
cis-Moll op. posth.**, c-Moll waere drei Be. Hier unter richtigem Namen
abgelegt.

### Das Bach-Praeludium ist einen Takt zu kurz

BWV 846 hat im Autograph 35 Takte. Ausgaben mit dem sogenannten
Schwencke-Takt - einem Takt, den ein Herausgeber des 19. Jahrhunderts
zwischen 22 und 23 einfuegte und der nachweislich nicht von Bach stammt -
haben 36. Diese Datei hat 34, folgt also keiner Variante, sondern es fehlt
etwas.

Welcher Takt, ist nicht ermittelt. Fuers Lesetraining unerheblich, zum
Einstudieren des Stuecks nicht.

Beide Befunde stehen in `public/scores/SOURCES.md`.

### Geprueft

Alle sieben im Browser geladen, keine Fehler, jedes rendert mit sauber
eingepasster Hoehe. Breite reicht von 7.500 Pixeln (Bach-Menuett) bis 31.850
(Mozart KV 545).

## Stueck und Takt direkt in der Kopfzeile (22.09.2026)

Beides waren bisher Beschriftungen und lagen hinter dem Einstellungsmenue.
Beides wechselt man aber *waehrend* des Uebens, teils dutzendfach pro
Stunde - ein Umweg ueber ein Menue ist dafuer der falsche Ort.

Jetzt sind es Schaltflaechen. Der Stueckname oeffnet die Stueckliste, die
Taktzahl ein Gitter aller Takte. Das Einstellungsmenue enthaelt wieder nur
Einstellungen.

Das Taktgitter zeigt nur Takte, in denen tatsaechlich etwas zu spielen ist.
Ein Sprung auf einen reinen Pausentakt wuerde die Position wortlos
woanders hin setzen, weil `seekToMeasure` Pausen ueberspringt.

Ein Hinweis im Panel verweist aufs direkte Antippen im Notenbild - das ist
schneller und landet auf der Note statt am Taktanfang.

## Der Uebungsgenerator haengt in der App (22.09.2026)

Eine Uebung ist jetzt eine dritte Art von Stueck, neben mitgeliefert und
selbst geladen. Erreichbar ueber die Stueckliste.

Waehlbar sind Art (Tonleiter, Arpeggio, Fuenf-Finger), Tonart (zwoelf Dur
und zwoelf harmonische Moll im Quintenzirkel), Oktaven und Bewegung
(parallel oder Gegenbewegung). Der Knopf zeigt jederzeit an, was entsteht.

### Erzeugte Uebungen ueberleben den Neustart ohne Speicher

Eine Uebung ist vollstaendig durch ihre Einstellungen beschrieben, also
traegt ihr Schluessel sie: `ex:scale:G:1:harmonicMinor:2:contrary:true`.
Beim Wiederherstellen wird der Schluessel gelesen und die Uebung neu
erzeugt - es gibt nichts abzulegen.

Die Fingersatz-Einstellung steht mit im Schluessel, weil die Zahlen in die
Notation eingebacken sind und nicht darueber liegen. Umschalten muss die
Uebung also neu erzeugen, und ein anderer Schluessel loest genau das aus.

### Geprueft am haertesten Fall

gis-Moll, zwei Oktaven, Gegenbewegung: fuenf Kreuze in beiden Systemen,
beide Haende auf demselben Startton, und an der erhoehten Septime je ein
**Doppelkreuz** pro Hand. Ein Generator, der in MIDI-Nummern rechnet,
schriebe dort ein schlichtes G hin.
