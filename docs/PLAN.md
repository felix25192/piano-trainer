# Projektplan

Stand: 23.09.2026

> **Wie diese Datei zu lesen ist:** Unten stehen die Abschnitte in der
> Reihenfolge ihrer Entstehung, jeder datiert. Zum Einsteigen reicht dieser
> Kopf und `CLAUDE.md`; der Rest ist Begruendung und wird interessant,
> sobald etwas seltsam aussieht.

## Wo wir stehen

**Fertig und im Einsatz.** Die App oeffnet auf einer Startseite, die den
Modus waehlen laesst und das zuletzt geoeffnete Stueck zum Weitermachen
anbietet. Noten laufen als eine horizontale Zeile durch, beide Schluessel,
richtige Vorzeichen, Groesse passt sich der Bildschirmhoehe selbst an.
Antippen setzt die Spielposition. Stueck und Takt sind aus der Kopfzeile
waehlbar. Eigene MusicXML-Dateien lassen sich laden und bleiben erhalten.
Sieben gestufte Stuecke sind dabei. Der Generator erzeugt Tonleitern,
Arpeggien und Fuenf-Finger-Uebungen in vierundzwanzig Tonarten, ein bis vier
Oktaven, parallel oder in Gegenbewegung.

Eine Stelle laesst sich ab der Markierung vorspielen, im Tempo der Noten, mit
Aufnahmen eines echten Fluegels und dem Pedal, das in den Noten steht.

**Und das Mikrofon spielt die App.** Ein Ton ins Zimmer gespielt schiebt die
Noten weiter - einstimmig, also Tonleitern, Arpeggien und jede einzelne
Linie. Spike A ist in Safari auf dem iPad bestanden, gemessen und nicht
vermutet.

Veroeffentlicht unter <https://felix25192.github.io/piano-trainer/>, bei jedem
Push auf `main` automatisch aktualisiert. 221 Tests.

**Als Naechstes.** Der Mikrofonknopf ist gebaut und ausgeliefert, aber am
Instrument noch nie ausprobiert - das ist der offene Faden. Bisher wurde
gesummt und es wurden Aufnahmen durch den Detektor geschickt. Zu klaeren ist
nur eines: geht die Markierung gar nicht weiter, oder springt sie an falsche
Stellen? Das erste heisst, die Anschlagserkennung sieht zu wenig, das zweite,
sie sieht zu viel; gedreht wird dann an `rise`, `gap` und `floor` in
`core/onset.ts`.

Danach der Reihe nach: Akkorde ueber das Mikrofon (Stufe 2, Wochen), ein
Service Worker gegen den schwarzen Bildschirm nach jedem Deploy, und die
gebundenen Toene, die der Matcher noch zweimal verlangt.

**Nativ ist gestrichen.** Es gibt keinen Mac, iOS-Builds brauchen aber macOS
und Xcode. Damit wird es auf dem iPad nie MIDI geben, denn Safari kann kein
Web MIDI. Das Mikrofon ist nicht der Umweg, sondern der Weg.

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

## Startseite, und ein Deckel fuer die automatische Groesse (22.09.2026)

Die App oeffnete bisher mitten im Stueck. Das war richtig, solange es nur eine
Sache zu tun gab. Mit den Uebungen als zweitem Modus ist es das nicht mehr:
welche Moeglichkeiten es gibt, stand nur in der Stueckliste, und dort auch
erst ganz unten.

Jetzt liegt eine Startseite davor, eine Karte je Modus. Sie fuehrt nicht auf
eine leere Ansicht, sondern in die Noten mit dem passenden Panel bereits
offen - den Modus waehlen und darin waehlen ist eine Entscheidung, keine zwei.
Dahinter steht das Stueck von letztem Mal, damit das Schliessen des Panels
nichts Leeres hinterlaesst.

Das Mikrofon steht als dritte Karte schon da, ausgegraut und mit "in Arbeit"
beschriftet. Es ist der naechste geplante Modus, und zwei Karten allein sehen
nicht nach einem Raster aus, das noch waechst. Eine Zeile in `MODES` entfernt
sie wieder.

### Der Preis: ein Fingertipp mehr

Bisher landete ein Neuladen direkt im letzten Stueck - ausdruecklich so
gebaut, damit Hinsetzen und Weiterspielen nichts kostet. Das ist jetzt eine
Karte ganz oben statt automatisch. Bewusst so entschieden: die Wahl des Modus
ueberhaupt sichtbar zu machen ist den Tipp wert.

Die Karte haelt, was sie verspricht. Der Weg zur Startseite raeumt OSMD ab und
damit den NoteMatcher; ohne Gegenmassnahme laege "Weiter ueben" bei Takt eins.
Der Schrittindex wird deshalb beim Verlassen festgehalten und nach dem
erneuten Parsen wieder angefahren, aber nur beim selben Stueck. Ueber einen
Reload hinweg gilt das nicht - dort faengt es an wie bisher.

### Die automatische Groesse hoert bei 2.0 auf

Die Anpassung blies ein System bisher auf die volle Fensterhoehe auf, auf dem
grossen Schirm bis 2.4. Das ist zu viel: ein einzelner Takt ueber den ganzen
Bildschirm liest sich schlechter als drei, weil Blattspiel davon lebt, zu
sehen was kommt. Also ein Deckel, `ZOOM_FIT_MAX = 2`. Von Hand geht es
weiterhin bis 4 - gedeckelt ist nur, was die App von selbst tut.

Damit bleibt Hoehe uebrig, und das Notenbild steht seitdem mittig statt oben.
Zentriert wird der OSMD-Container, nicht das SVG darin: der Cursor ist absolut
in diesem Container positioniert und liefe sonst neben den Noten her.
`align-items: safe center` schiebt alles an den oberen Rand zurueck, sobald
das Notenbild doch hoeher ist als das Fenster - bei mittiger Ausrichtung waere
es dann oben und unten zugleich abgeschnitten, und `overflow-y` steht auf
`hidden`, koennte den Kopf also nicht zurueckholen.

## Vorspielen: Toene hoeren statt Namen lesen (22.09.2026)

Ein Knopf spielt ab der gruenen Markierung, ein zweiter Druck haelt an. Damit
bekommt man ein Gehoer fuer die Stelle, ohne dass ihr die Notennamen
danebengeschrieben werden - und genau das ist der Unterschied. Namen zu lesen
waere Text lesen; das Ohr bekommt ein Ziel und die Augen behalten die Arbeit,
es auf dem Papier wiederzufinden.

Die Wiedergabe nimmt die Uebungsposition mit. Wer eine Stelle anhoert, steht
danach genau dort und kann sie selbst spielen.

### Erst messen, dann bauen

Der Score kannte keine Zeit: Tonhoehen, Takte, Positionen, mehr nicht. Bevor
irgendetwas entstand, lief eine Probeseite ueber alle sieben Stuecke und hat
ausgelesen, was OSMD ueberhaupt hergibt. Das Ergebnis hat zwei Entscheidungen
umgedreht, die sonst still falsch gewesen waeren:

**Das Tempo wird pro Takt gelesen, nicht vom Blatt.** Bei der *Danse
villageoise* ist `DefaultStartTempoInBpm` schlicht `undefined`, waehrend jeder
einzelne Takt sauber 180 meldet. Der Blattwert haette ausgerechnet dieses eine
Stueck wortlos auf einen Ersatzwert fallen lassen - und ein falsches Tempo
merkt man nicht, man haelt es fuer die Vorlage.

**Der Zeitstempel ist der enrolled, nicht der source.** Der eine zaehlt die
Wiederholung mit, der andere springt bei ihr zurueck. Das Menuett steht mit 32
Takten auf dem Papier und misst 47,75 ganze Noten - also 64 gespielte Takte.
Da der Cursorlauf denselben Weg nimmt, erbt die Wiedergabe genau die
Reihenfolge, die auch das Ueben hat; auseinanderlaufen koennen sie nicht.

Ausserdem aus der Messung: Laengen sind ueberall gesetzt, Triolen sind bereits
als Zwoelftel eingerechnet, und in keinem der sieben Stuecke gibt es eine Note
der Laenge null. Das Praeludium hat 134 gebundene Noten - genug, um Bindebogen
nicht als Randfall zu behandeln.

### Was rein ist und was nicht

`core/playback.ts` rechnet Notenwerte und Tempo in Sekunden um und weiss
nichts von Web Audio. Heraus kommt ein Plan - diese Tonhoehe, ab dieser
Sekunde, so lange -, und genau das laesst sich ohne Lautsprecher testen: die
Zwoelftel aus dem Mondschein, die punktierte Viertel, der gebundene Ton, der
Sprung von 72 auf 30 im Praeludium.

`core/NoteOutput.ts` ist der Port, spiegelbildlich zu `NoteInputSource`. Die
eine Seite laesst das Instrument die App treiben, diese die App ein
Instrument. Der Port ist bewusst eng: der Aufrufer uebergibt einen fertigen
Plan und fragt die Uhr, er verlangt nie einen Ton *jetzt*. "Jetzt" ist genau
das, was ein JavaScript-Timer nicht versprechen kann.

`adapters/SynthOutput.ts` erzeugt den Klang selbst, ohne eine einzige
Sample-Datei. Kein `setTimeout` fuer den Rhythmus: der driftet, zittert unter
Last und wird im Hintergrundtab gedrosselt, und alle drei waeren als schlechtes
Timing hoerbar. Der Timer weckt nur alle 25 ms und fuellt die naechsten 200 ms
auf; wann ein Ton wirklich klingt, entscheidet die Audio-Uhr, die in Samples
zaehlt.

Der Klang ist synthetisch und gibt sich nicht als Fluegel aus. Angestrebt ist
ein Ton, der *angeschlagen* klingt statt eingeschaltet - heller Einschwinger,
der binnen einer Viertelsekunde dunkler wird, tiefe Toene klingen laenger nach
als hohe. Ob das reicht, entscheidet das Ohr; der Tausch gegen echte Samples
ist dank des Ports eine Datei daneben und sonst nichts.

### Nachgemessen statt geglaubt

Die Einsaetze wurden nicht angehoert, sondern an der Audio-Uhr mitgeschrieben.
Menuett bei 126: Viertel 0,476 s, Achtel 0,238 s - exakt 60/126 und die
Haelfte davon, ueber die ersten zwoelf Einsaetze ohne Abweichung. Auf 50 %
gestellt verdoppelt sich beides sauber. Die Fuenf-Finger-Uebung erzeugt 18
Toene fuer neun Noten in zwei Haenden, im Abstand von genau 0,5 s, und haelt
von allein an.

Dabei kam noch heraus, dass OSMD einem Stueck ohne Tempoangabe von sich aus
120 gibt. Der eigene Ersatzwert ist damit nur noch ein Schutz gegen eine
Division durch Null, nicht der Uebungswert - der Kommentar sagt das jetzt auch.

### Gebundene Toene: die Daten sind da, der Matcher aendert sich nicht

Ein Bindebogen ist *ein* Klang. Die Wiedergabe schlaegt die Fortsetzung
folgerichtig nicht erneut an; `ExpectedNote.heldOver` markiert sie, und
`Tie.Duration` gibt dem ersten Ton die Laenge der ganzen Kette.

Der NoteMatcher verlangt sie weiterhin ein zweites Mal - was am Klavier falsch
ist, man haelt die Taste ja. Das bleibt bewusst vorerst so: es aendert, was die
App vom Spieler fordert, und zwar in jedem Stueck. Eine solche Entscheidung
gehoert nicht als Nebenwirkung in eine Aenderung, die Ton hinzufuegt. Die
Daten dafuer liegen jetzt bereit, der Rest ist eine Zeile und ein paar Tests.

### Offen

Der Klingelschalter des iPads schaltet Web Audio stumm - ungetestet, gleiche
Sorte Unbekannte wie Spike A. Dynamik und Pedal werden ignoriert: alles klingt
gleich laut, nichts klingt nach. Bei Chopin und Mondschein hoert man genau das.

## Echtes Klavier statt Synthesizer (22.09.2026)

Der synthetische Klang hat einwandfrei funktioniert und trotzdem nicht
getaugt - Felix' Urteil nach dem ersten Hoeren am Geraet. Damit ist er raus.
Der Port hat genau das geleistet, wofuer er da war: eine neue Datei neben der
alten, `SampledPiano.ts` statt `SynthOutput.ts`, und darueber aendert sich
nichts ausser einem Import. `core/playback.ts` hat niemand angefasst.

Es sind jetzt Aufnahmen des **Salamander Grand Piano** von Alexander Holm, ein
Yamaha C5, CC-BY 3.0. Dreissig Dateien, alle drei Halbtoene von A0 bis C8, rund
2 MB. Die Lizenz verlangt Namensnennung, die steht in `public/piano/SOURCES.md`
und im Einstellungsmenue.

Der Abstand von drei Halbtoenen ist Holms eigener - "sampled in minor thirds
from the lowest A" steht in seiner README. Damit wird keine Note um mehr als
einen Halbton verschoben, und das hoert man nicht.

### Der Speicher war das Problem, nicht die Groesse

2 MB herunterzuladen ist nichts. Dekodiert sind es **142 MB**: die Aufnahmen
sind stereo und laufen bis zu fuenfundzwanzig Sekunden, weil sie einer tiefen
Saite bis in die Stille folgen. So viel haelt ein Tablet nicht, der Tab fliegt
raus.

Drei Massnahmen, jede gemessen statt geschaetzt:

- **Auf Mono gefaltet**: 71 MB. Stereobreite ist auf einem Tabletlautsprecher
  ohnehin kein Gewinn.
- **Auf zwoelf Sekunden gekappt**: 50 MB. Nichts braucht den Rest - eine Note
  wird gedaempft, wenn ihr notierter Wert vorbei ist, und die laengste Note in
  den sieben Stuecken ist eine Ganze bei 44, also fuenfeinhalb Sekunden, bei
  halbem Tempo elf. Der Schnitt bekommt eine kurze Ausblendung, sonst knackt er.
- **Nur geladen, was vorkommt**: Das Menuett braucht fuenfzehn der dreissig
  Aufnahmen, eine C-Dur-Tonleiter fuenf. Was einmal da ist, bleibt.

### Der Pegel wurde gemessen, nicht gehoert

Hier kann niemand zuhoeren, also haengt ein Analyser am Ausgang und meldet die
Spitze. Der erste Versuch lag bei **0,238** - viel zu leise, weil der
Kompressor bei -12 dB alles wegdrueckte. Die Aufnahmen selbst gipfeln je nach
Lage nur zwischen 0,08 und 0,31.

Also neu gerechnet: Faktor 2 brachte den Menuett-Anfang auf 0,897 - laut
genug, aber ohne Reserve fuer ein Stueck mit vier Toenen pro Hand. Bei Faktor
1,6 erreicht die Chopin-Nocturne, das dichteste der sieben, **0,888 vor und
0,921 hinter dem Begrenzer**. Kein Clipping, und der Begrenzer steht fast
immer still - genau so soll er stehen, denn ein Begrenzer, der dauernd
arbeitet, nimmt einem Akkord den Unterschied zum Einzelton.

### Was gleich geblieben ist

Der Rhythmus. Nach dem Tausch gemessen: Menuett bei 126 weiterhin 0,476 s pro
Viertel und 0,238 s pro Achtel. Das war zu erwarten, weil der Zeitplan aus
`core/playback.ts` kommt und den hat der Tausch nicht beruehrt - aber erwartet
ist nicht geprueft.

Dasselbe noch einmal auf der veroeffentlichten Seite, weil dort der Pfad zu
den Aufnahmen ein anderer ist: fuenfzehn Dateien unter
`/piano-trainer/piano/`, Abstaende 0,477 und 0,238, Spitze 0,861 ueber sechs
Takte. Damit ist auch die Zahl im Kommentar berichtigt - vorher stand dort
eine aus einem kuerzeren Ausschnitt hochgerechnete 0,7.

### Neu offen

Das erste Vorspielen einer Sitzung braucht Netz. Die Aufnahmen liegen in der
App, aber ohne Service Worker haelt sie nichts offline vor; einmal geladen
reicht der Browsercache. Am Klavier ohne WLAN muss man also einmal vorher
gespielt haben.

## Das Pedal, soweit es notiert ist (22.09.2026)

Der Klang stimmte, aber jede Note wurde exakt am notierten Wert gedaempft -
bei Chopin klang das nach Schreibmaschine statt nach Nocturne.

Zuerst nachgesehen, was ueberhaupt in den Dateien steht, und der Befund hat
den Umfang bestimmt: **nur die Chopin-Nocturne hat Pedal notiert**, 108
Spannen. Die anderen sechs haben keins.

### Die Falle heisst Pedalwechsel

Beim Wechsel geht der Fuss hoch und sofort wieder runter, damit die Harmonie
klart ohne dass die Linie abreisst. Beide Zeichen tragen dann **denselben
Zeitstempel**. Sortiert man nur nach Zeit, landet das neue "runter" vor dem
alten "hoch", und es entstehen Spannen der Laenge null, waehrend die echten
unpaarig liegenbleiben. Genau das ist mir im Probelauf passiert: 71 Spannen
und 74 unpaarige Zeichen statt sauberer 108.

Gleicher Zeitstempel heisst also: erst hoch, dann runter. Danach stimmt es
exakt - 108 Spannen, null unpaarig, Laengen von einer Viertel bis zu zwei
ganzen Noten.

Weil genau das die Stelle ist, an der man sich irrt, liegt sie in
`core/pedal.ts` und nicht im Adapter. Der Adapter sammelt nur die rohen
Zeichen ein, das Paaren ist rein und hat Tests - unter anderem einen, der den
Fehler von oben festhaelt.

### Notiert wird im gedruckten Takt, gespielt in der Reihenfolge des Spielens

Pedalzeichen tragen Zeitstempel der Partitur, die Schritte laufen in der
Reihenfolge, in der gespielt wird - eine Wiederholung zieht beides
auseinander. Also wird die Frage "ist hier das Pedal unten" in der Zeit der
Partitur gestellt und nur die Antwort herueber gerechnet: wie lange die
Daempfer noch oben bleiben. Die Nocturne hat zwar keine Wiederholungen, aber
darauf soll sich nichts verlassen.

### Nachgemessen

Chopin, erste vier Toene unter der Pedalspanne von 0 bis 0,375:

    e'   2,433 s gemessen, 2,433 gerechnet
    gis' 2,383                2,384
    cis" 2,325                2,325
    Cis  2,853                2,853

Sie klingen 1,552 s statt der notierten 1,034 - genau bis zum Lueften. Der
Schritt bei 0,375 liegt zwischen zwei Spannen und behaelt seine Schreibweise,
auch das gemessen.

Gegenprobe am Menuett, das kein Pedal notiert: unveraendert, 1,239 s fuer die
Viertel und 1,956 fuer die halben Akkordtoene - beides auf die Millisekunde
wie vorher.

### Was bewusst fehlt

Fuer die sechs Stuecke ohne Pedalzeichen muesste man es erfinden. Am meisten
schmerzt die Mondscheinsonate, deren ganzer Charakter an den angehobenen
Daempfern haengt - Beethoven schreibt es auch hin, aber als Worte *senza
sordini* und nicht als Pedalzeichen, es steht also nicht in den Daten.

Eine Faustregel gaebe es (Pedal wechseln, sobald sich der tiefste klingende
Ton aendert), und beim Mondschein kaeme sie dem nah, was ein Pianist tut. Bei
Bach waere sie schlicht falsch. Dieselbe Entscheidung wie bei den
Moll-Fingersaetzen: lieber keins als ein falsches.

## Ein Pruefstand fuer die Tonhoehenerkennung (22.09.2026)

Das Klavier steht woanders, das Kabel soll es auch nicht sein, und der Weg
soll ueber das Mikrofon gehen. Damit fehlt die Referenz, die MIDI geliefert
haette - also musste eine andere her, bevor irgendetwas gebaut wird.

Sie lag schon da: die **dreissig Aufnahmen eines echten Yamaha C5** in
`public/piano/`. Bekannter Ton rein, "erkennst du ihn?" raus. Echter
Klavierklang, wiederholbar, ohne Instrument und ohne Kabel.

### Warum YIN und nicht ein Spektrum

Ein Spektrum verfuehrt dazu, den lautesten Ausschlag zu nehmen - und bei einer
Klaviersaite ist der lauteste Ausschlag oft *nicht* der Grundton. Ein tiefes A
steckt regelmaessig mehr Energie in seinen zweiten Teilton, und wer Spitzen
pflueckt, meldet dann die Oktave darueber. Schlimmer noch: der Grundton kann
ganz fehlen und das Ohr hoert die Note trotzdem.

YIN fragt etwas anderes: ab welcher Verschiebung wiederholt sich die Welle am
ehesten selbst? Ein fehlender Grundton aendert die *Form* einer Periode, nicht
ihre *Laenge*. Beide Faelle stehen als Tests in `pitchDetect.test.ts`.

### Was der Pruefstand gemessen hat

    Fenster 16384 (372 ms), 0,3 s nach Anschlag: 26/30, 73,8 ms Rechenzeit
    Fenster  8192 (186 ms), 0,3 s nach Anschlag: 26/30, 31,1 ms
    Fenster  4096 ( 93 ms), 0,3 s nach Anschlag: 26/30, 14,4 ms
    Fenster  2048 ( 46 ms), 0,3 s nach Anschlag: 23/30,  4,3 ms

    Fenster 8192, 0,05 s nach Anschlag: 28/30
    Fenster 8192, 1    s nach Anschlag: 21/30
    Fenster 8192, 3    s nach Anschlag: 15/30

Drei Befunde, jeder mit einer Folge:

**Am Anschlag erkennen, nicht im Nachklang.** Von 28/30 direkt nach dem
Anschlag faellt es auf 15/30 nach drei Sekunden, und ein tiefes Fis liest sich
dann eine Oktave zu hoch. Der Grundton stirbt vor seinen Teiltoenen. Das passt
zum Glueck genau zur Engine: die fragt, ob ein Ton *angeschlagen* wurde, nie
was noch klingt.

**Das Fenster bestimmt die Verzoegerung.** 2048 Samples reichen nicht fuer die
untersten drei Tasten - zwei Perioden eines A0 sind 3200 Samples, das ist
Arithmetik und kein Zufall, und genau das haelt ein Test fest. 4096 traegt
alles ausser dem Bass, 8192 traegt auch den. 93 bis 186 ms Klang muessen also
erst einmal da sein, bevor ueberhaupt geantwortet werden kann.

**Die Rechenzeit ist das eigentliche Problem.** 14 bis 31 ms pro Durchgang,
auf einem Desktop, ist viel zu viel fuer etwas, das dauernd laufen soll. Der
Ausweg steht schon fest: die App weiss immer, welchen Ton sie erwartet, also
muss nicht die ganze Klaviatur durchsucht werden, sondern nur ein schmales
Band darum.

### Die vier Ausreisser

Es sind D#7, F#7, A7 und C8 - das obere Ende der Klaviatur, und sie liefern
*nichts* statt etwas Falschem. Bei zwei davon ist die Ursache nachgemessen und
harmlos: ihr Effektivpegel liegt 0,3 s nach dem Anschlag bei 0,0014 und
0,0016, unter der Stille-Schwelle von 0,002. Das Fenster ist tatsaechlich fast
still, das Schweigen also richtig. Keines der sieben Stuecke kommt jemals dort
hinauf.

### Nachtrag: der naheliegende Ausweg war falsch (22.09.2026)

Oben steht als Ausweg aus dem Geschwindigkeitsproblem: die App kennt den
erwarteten Ton, also muss nur ein schmales Band darum durchsucht werden. Das
war eine Behauptung, keine Messung. Nachgemessen ist sie **falsch**, und zwar
so, dass sie die App zum Luegner gemacht haette.

    Eingeengt auf +-100 Cent:        28/30 richtig,  4,4 ms
      Oktave zu hoch gespielt:       24/26 faelschlich angenommen
      Halbton zu hoch gespielt:      28/29 faelschlich angenommen

    Voll erkennen, dann vergleichen: 28/30 richtig, 18,2 ms
      Oktave zu hoch gespielt:        0/26
      Oktave zu tief gespielt:        0/26
      Halbton zu hoch gespielt:       0/29
      Halbton zu tief gespielt:       0/29

Zwei Ursachen, beide grundsaetzlich:

**Eine Welle mit der Periode T wiederholt sich auch bei 2T.** Wer nur um den
erwarteten Ton herum sucht und der Spieler greift eine Oktave zu hoch, findet
dort eine echte Wiederholung - und meldet zufrieden den erwarteten Ton. Das
laesst sich durch ein engeres Band nicht heilen: bei +-25 Cent sind es
immer noch 23 von 26.

**YIN normiert gegen den Bereich, ueber den es gerechnet wird.** Die
kumulierte mittlere Differenz teilt jeden Wert durch den laufenden Mittelwert
aller kleineren Verschiebungen. Wird dieser Bereich beschnitten, verschiebt
sich der Massstab, und die feste Schwelle von 0,15 bedeutet nicht mehr
dasselbe. Deshalb rutschen auch Halbtonfehler durch, die musikalisch gar
nichts mit der erwarteten Periode zu tun haben.

Ein eingeengtes YIN ist also kein schnelleres YIN, sondern ein anderes und
schlechteres. Fuer einen Trainer ist das die falsche Richtung: ein
uebersehener richtiger Ton aergert, ein durchgewunkener falscher bringt
Falsches bei.

### Der richtige Ausweg ist nicht enger, sondern seltener

Die Erkennung bleibt breit und wird danach mit dem erwarteten Ton verglichen.
Dass sie 18 ms kostet, ist nur dann ein Problem, wenn sie dauernd laeuft - und
das muss sie nicht. Der Pruefstand hat ja schon gezeigt, dass nur der
**Anschlag** zaehlt: 28/30 in den ersten 50 ms, 15/30 nach drei Sekunden.

Also: eine billige Anschlagserkennung laeuft durch, und der teure Durchgang
laeuft einmal pro angeschlagenem Ton. Bei acht Toenen pro Sekunde sind das
acht mal 18 ms, also gut ein Zehntel eines Kerns. Das traegt.

## Spike A ist bestanden, in Safari (22.09.2026)

Auf dem iPad gemessen, nicht angenommen: Berechtigung kommt, der Stream
laeuft, und `core/pitchDetect.ts` meldet einen gesummten Ton mit einer
**Klarheit von 0,94 bis 1,00** - also so sicher wie am Schreibtisch gegen die
Aufnahmen. Der Mikrofonweg ist damit offen. Vom Startbildschirm aus ist er
weiterhin ungetestet; genau dort saesse der WebKit-Fehler, falls er ueberhaupt
zuschlaegt.

Der Weg dorthin war allerdings muehsam, und daran war die Testseite schuld,
nicht das Geraet. Drei Sachen, die alle in dieselbe Richtung zeigen:

**Der Pegelbalken war linear skaliert.** `rms * 600` bedeutet: ein voellig
brauchbares Signal von 0,01 zeigt ein Prozent Breite. Das sieht aus wie
"nichts kommt an", obwohl alles da ist. Jetzt logarithmisch von -60 dB bis 0.

**Darunter sass eine harte Schwelle.** Unterhalb von `rms > 0.006` wurde die
Erkennung nicht einmal aufgerufen. Unterhalb davon hat die Seite also nicht
schlecht erkannt, sondern nie - und sie hat es nicht gesagt. Die Schwelle ist
weg; der Detektor bringt seine eigene mit und ist gegen die Lautstaerke
normiert, eine zweite absolute Huerde davor war schlicht falsch.

**Die Seite mass etwas anderes als das, was ausgeliefert wird.** Sie trug eine
eigene grobe Autokorrelation mit sich herum, deren Schwelle absolut und damit
lautstaerkeabhaengig war. Jetzt benutzt sie `core/pitchDetect.ts`. Dafuer ist
sie aus `public/` in eine zweite Build-Eingabe gewandert, die Adresse bleibt
gleich.

Allgemeiner Schluss daraus: **eine Anzeige, die nur "nichts" sagen kann, ist
keine Messung.** Die Seite zeigt jetzt Zahlen - Pegel in dB, lautester Wert
seit dem Start, Erkennungen von Versuchen, zuletzt erkannte Frequenz mit
Klarheit. Damit war die Ursache in einem Durchgang zu sehen.

### Was der Lautsprechertest gezeigt hat

Klaviermusik vom Handylautsprecher bewegt den Balken kaum. Das ist nicht der
Fall, fuer den die App gebaut wird: ein kleiner Lautsprecher gibt unterhalb
einiger hundert Hertz fast nichts her, und genau dort liegt das meiste
Klavierspiel. Dazu ist eine Aufnahme mehrstimmig, und der Detektor ist
einstimmig.

Es ist trotzdem eine nuetzliche Erinnerung daran, wo die eigentliche Arbeit
liegt: nicht in der Technik des Zuhoerens, sondern in der Mehrstimmigkeit. Ein
einzelner Ton im Raum ist der Fall, auf den es ankommt - und der geht.

## Warum es im Stummmodus erst ging und dann nicht mehr (22.09.2026)

Felix ist aufgefallen, dass die App morgens auch bei gestelltem Stummschalter
klang und nach den Reparaturen nicht mehr. Das war kein Zufall, sondern eine
Folge davon, dass das Mikrofon jetzt korrekt losgelassen wird.

Safari legt einen blanken AudioContext in die Kategorie **ambient**, und die
schaltet der Klingelschalter hart stumm. Eine Seite mit offenem Mikrofon
bekommt dagegen eine Aufnahmesitzung, und die ignoriert den Schalter - deshalb
klingen Videotelefonate im Stummmodus. Solange die Testseite das Mikrofon
hielt, lebte die App von deren Kategorie. Mit dem Loslassen kam die
Voreinstellung zurueck.

Der richtige Weg dafuer ist `navigator.audioSession.type = "playback"`, ab
Safari 16.4. Das ist die Kategorie, in die ein Musikabspieler gehoert, und sie
wird nicht stummgeschaltet. Sie muss gesetzt sein, **bevor** der Kontext
entsteht, und wird zur Sicherheit bei jedem Start noch einmal angemeldet -
beim ersten Mal hat Safari womoeglich noch keine Sitzung zum Einstellen.

Zwei Dinge dazu fuers Protokoll. Erstens ist `playback` exklusiv: es haelt
andere Wiedergabe auf dem Geraet an. Fuer eine Uebe-App ist das richtig, man
will nicht gegen Musik aus einer anderen App anspielen. Zweitens wird daraus
`play-and-record`, sobald das Mikrofon dazukommt - eine Seite kann nur eine
Kategorie halten, und das ist genau die Stelle, an der sich Zuhoeren und
Vorspielen wieder in die Quere kommen werden.

Und eine allgemeine Lehre: dass etwas funktioniert, heisst nicht, dass es aus
dem richtigen Grund funktioniert. Der Stummmodus ging morgens nur, weil eine
vergessene Testseite nebenher eine Aufnahmesitzung offen hielt. Wer das als
"geht ja" abgehakt haette, haette es spaeter und unerklaerlicher verloren.

## Ein Besitzer fuer die Audio-Sitzung (23.09.2026)

Felix: "Wir planen nicht richtig, sondern ich beschwere mich und du fixt
Kleinigkeiten und machst damit anderes wieder kaputt." Er hatte recht, und das
Beispiel ist schlimmer als es aussieht: die Kollision stand im selben Commit,
mit dem sie ausgeloest wurde.

Die Kette ging so. Die Testseite gab das Mikrofon nie frei, also war das ganze
Geraet stumm. Freigabe eingebaut - damit war die Wiedergabe im Stummmodus weg,
denn die hatte von der Aufnahmesitzung gelebt, die den Klingelschalter
ignoriert. Also `audioSession.type = "playback"` gesetzt - damit war das
Mikrofon kaputt, weil eine Seite nur eine Kategorie halten kann.

Jede Reparatur wurde fuer sich geprueft. Keine dagegen, was vorher ging.

### Das Problem war nicht dreimal, sondern einmal

Die Audio-Sitzung ist **eine exklusive Ressource des Geraets**, und drei
Stellen im Code fassten sie unabhaengig voneinander an. Das ist kein Fehler,
den man dreimal repariert, sondern ein fehlender Besitzer.

`core/audioMode.ts` traegt jetzt die Regel: die App ist immer in genau einem
von `idle`, `playing`, `listening`, jeder Modus braucht eine Kategorie, und ein
Wechsel gibt erst frei und nimmt dann. Rein und getestet - die Regel stand
vorher als Kommentar an drei Stellen und wurde von keiner befolgt.

`adapters/audioSession.ts` ist die einzige Datei, die noch `new AudioContext`,
`navigator.audioSession.type` oder `getUserMedia` anfasst. Ein grep haelt das
nach; der einzige verbleibende Treffer ausserhalb ist eine Existenzpruefung in
der Umgebungskarte der Testseite.

Bewusst eine geteilte Instanz. Das Geraet hat genau eine Sitzung, und sie als
ein Objekt zu modellieren ist ehrlich - vor allem macht es den Fehler
unmoeglich, der dazu gefuehrt hat.

### Verborgen ist nicht dasselbe wie verlassen

Beim Pruefen fiel eine Luecke auf: App und Testseite sind zwei Seiten, und ein
Modul lebt pro Dokument. Jede haette ihren eigenen Besitzer, und sie wuerden
sich das Geraet gegenseitig streitig machen - die Invariante haette genau an
der Seitengrenze aufgehoert, wo sie gebraucht wird.

Also unterscheidet der Besitzer zwei Faelle. Nur verborgen, also ein anderer
Tab davor, gibt das Mikrofon frei und sonst nichts; Wiedergabe bleibt, weil ein
weggeschalteter Tab am Desktop weiterspielen soll. Die Seite verlassen gibt
alles frei - und genau das passiert auf dem Weg von der App zum Geraetetest.

### Die Liste, die das Wiederholen verhindert

Sechs Punkte stehen jetzt in `CLAUDE.md`, und sie werden nach **jeder**
Aenderung an Audio durchgegangen, nicht nur die eine reparierte Sache. Drei
davon lassen sich hier pruefen, drei nur auf dem Geraet - und die kommen als
eine Runde, nicht als sechs einzelne Beschwerden.

Das ist die eigentliche Lehre des Tages, und sie ist prozessual, nicht
technisch: eine Reparatur, die nur gegen ihr eigenes Symptom geprueft wird,
ist kein Fortschritt, sondern eine Verschiebung.

## Das Mikrofon spielt die App, einstimmig (23.09.2026)

Stufe 1 steht: ein Ton ins Zimmer gespielt schiebt die Noten weiter. Damit
erfuellt die App ihren Zweck ohne Kabel, ohne Mac und ohne irgendetwas
anzuschliessen - was nach dem Befund "kein Mac verfuegbar" nicht der Umweg ist,
sondern der Weg.

### Zwei Haelften, und nur eine laeuft dauernd

`core/onset.ts` hoert den **Anschlag**. Es sieht eine Zahl pro Bild, die
Lautstaerke, und sagt, ob gerade angeschlagen wurde. Das ist billig und laeuft
hundertmal in der Sekunde. Erst wenn es ja sagt, laeuft die
Tonhoehenerkennung, und die kostet acht Millisekunden.

Keine Sparmassnahme, sondern direkt aus dem Pruefstand: ein Ton wird in den
ersten fuenfzig Millisekunden 28 von 30 Mal erkannt und nach drei Sekunden nur
noch 15 von 30, weil der Grundton vor seinen Teiltoenen stirbt. Der Anschlag
ist der einzige Moment, in dem sich Fragen lohnt - und zufaellig genau das, was
die Engine wissen will, denn die fragt, ob gespielt wurde, nie was noch klingt.

Die Schwelle ist ein Verhaeltnis und keine Differenz: ein Klavier deckt einen
enormen Lautstaerkebereich ab, und ein fester Abstand wuerde entweder leises
Spiel verschlucken oder bei lautem dauernd ausloesen. Dazu eine Mindestpause
von 70 ms, weil ein Hammerschlag keine saubere Stufe ist, sondern nachschwingt
und die Schwelle sonst mehrfach reisst. Sechzehntel bei 160 sind ein Ton alle
94 ms; darunter muss die Pause bleiben, und ein Test haelt das fest.

### Ein Test hatte unrecht, nicht der Detektor

Beim Schreiben fiel ein Test um: zwei Anschlaege 70 ms auseinander, der zweite
wurde nicht erkannt. Die Ursache war der Test - er fuetterte die beiden Bilder
direkt hintereinander, **ohne die dazwischen**. In einer echten Schleife faellt
der Pegel in dieser Zeit ab, und genau davon lebt die Erkennung. Mit den
Zwischenbildern stimmt es. Den Detektor dafuer aufzuweichen waere der falsche
Weg gewesen; die Versuchung war da, weil ein umgefallener Test wie ein Fehler
im Code aussieht.

### Was in der Oberflaeche dazugehoert

Zuhoeren und Vorspielen koennen das Geraet nicht beide halten. Das steht seit
gestern in `core/audioMode.ts`, und jetzt sagen es auch die Knoepfe: jeder
sperrt den anderen, solange er laeuft.

Der Fehlerweg ist geprueft. Im Browserfenster ist das Mikrofon gesperrt, und
die App zeigt "Permission denied" im Fehlerkasten statt abzustuerzen. Danach
spielt sie unveraendert weiter: 47 Toene, Abstaende 0,476 und 0,238.

### Was noch fehlt

Akkorde - der Detektor ist einstimmig und bleibt es, mehrstimmig ist Stufe 2
und ein anderes Problem. Und der Pegel am echten Instrument ist ungemessen:
bisher wurde gesummt oder eine Aufnahme durchgeschickt.

