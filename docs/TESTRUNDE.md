# Testrunde am Klavier, mit dem iPad

Stand: 22.10.2026, Teil E ergaenzt am 10.11.2026, Mitschnitt und Teil F am
11.11.2026. Eine Runde, etwa eine Stunde, an beiden Instrumenten. Was sie klaeren soll, steht in `PLAN.md` unter
den Abschnitten vom 22.10. und vom 10.11.2026.

Gezaehlt wird, nicht beurteilt: "11 von 15" hilft, "ging so" nicht. Den Rest
schreibt die App selbst mit: Mit dem **Mitschnitt** nimmt sie auf, was das
Mikrofon hoert, zusammen mit jedem Anschlag, den sie bemerkt hat, und was sie
in dem Moment erwartet hat. Screenshots sind damit nicht mehr noetig. Aus den
Aufnahmen kann ich danach jeden Anschlag am Pruefstand nachspielen, und sie
sind das erste echte Material fuer die zwei Haende.

## Vorbereitung

- [ ] iPadOS-Version notieren (Einstellungen → Allgemein → Info).
- [ ] In Safari <https://felix25192.github.io/piano-trainer/> oeffnen und
      einmal neu laden, damit der neueste Stand da ist.
- [ ] Zahnrad → **Anschlagsprotokoll** einschalten, und darunter **Mitschnitt
      fuer die Testrunde**. Solange das Mikrofon zuhoert, steht dann ein
      roter Punkt auf seinem Knopf.
- [ ] Fuer die Aufnahmen auf dem iPad einen Ordner anlegen (Dateien-App, etwa
      "Testrunde").
- [ ] iPad aufs Notenpult. Abstand zur Schallquelle grob notieren.
- [ ] Am Kawai: kein Kopfhoerer, Lautstaerke etwa in der Mitte. Notieren, wo
      der Regler steht und ob Hall eingeschaltet ist.

## A. Das Mikrofon am Instrument

Das ist der Kern der Runde. Alle Durchgaenge **erst am Kawai, dann am
akustischen Klavier**, sonst gleich.

Uebung: Startseite → Tonleitern & Uebungen → Tonleiter, C-Dur, 1 Oktave,
Parallel. Oben in der Kopfzeile auf **rechte Hand** schalten, dann unten den
Knopf **Mikrofon**.

**Je Durchgang einmal das Mikrofon an und wieder aus.** Dann ist jeder
Durchgang eine eigene Aufnahme, und beim Ausschalten erscheint "Mitschnitt
fertig". Dort **Teilen** → **In Dateien sichern** → der Ordner von eben. Die
Datei heisst nach der Uhrzeit; die Nummer des Durchgangs und das Instrument
kurz notieren, etwa "A2 Kawai 10:32".

| # | Durchgang | Kawai | akustisch |
|---|---|---|---|
| 1 | Rechte Hand, auf und ab, langsam und deutlich getrennt, ohne Pedal | _ von 15 | _ von 15 |
| 2 | Wie 1, aber gebunden im normalen Tempo | _ von 15 | _ von 15 |
| 3 | Wie 2, mit der **linken Hand** | _ von 15 | _ von 15 |
| 4 | Wie 2, aber mit gedruecktem Pedal | _ von 15 | _ von 15 |
| 5 | Stuecke → Bach, Menuett G-Dur, rechte Hand, Takt 1 bis 8 im eigenen Tempo | bis Takt _ | bis Takt _ |

Dazu je Instrument:

- [ ] **Rot, obwohl richtig gespielt?** Wie oft, und bei welchem Ton.
- [ ] **Weiter, obwohl nichts gespielt?** Etwa durch Geraeusche im Raum.

Erwartung vom Pruefstand, damit die Zahlen einen Massstab haben: 1 bis 3 sollten
fast alles schaffen, 4 deutlich weniger (am Pruefstand etwa die Haelfte).
Liegt 1 am Instrument weit darunter, ist das der wichtigste Befund der Runde.

## B. Ton und Audio-Sitzung

Vorher im Zahnrad den **Mitschnitt ausschalten**: Hier geht es um den Ton,
nicht um Aufnahmen.

Die sechs Punkte aus `CLAUDE.md`, in dieser Reihenfolge, weil jeder auf dem
vorigen aufbaut. Safari einmal ganz schliessen und neu oeffnen, damit der Start
frisch ist.

- [ ] **3** - Startseite → Mit dem Mikrofon → Geraetetest oeffnen: hoert er
      einen gesummten Ton?
- [ ] **5 und 1** - Zurueck zur App, ein Stueck oeffnen, ▶: klingt es?
- [ ] **2** - Stummmodus einschalten (Kontrollzentrum, Glockensymbol), noch
      einmal ▶: klingt es trotzdem? Danach Stummmodus wieder aus.
- [ ] **4** - Noch einmal in den Geraetetest: hoert er nach dem Vorspielen
      immer noch?
- [ ] **6** - Safari-Tab schliessen und in einer anderen App Musik oder ein
      Video abspielen: ist der Ton da?

## C. Vom Home-Bildschirm

Bisher nur in Safari getestet. Vom Home-Bildschirm koennte der alte
WebKit-Fehler 185448 das Mikrofon verweigern, und der Service Worker lief auf
dem Geraet noch nie.

- [ ] In Safari: Teilen → Zum Home-Bildschirm. Die App vom neuen Symbol
      oeffnen.
- [ ] Durchgang A1 an einem der Instrumente: hoert das Mikrofon auch hier?
- [ ] ▶ bei einem Stueck: klingt es?
- [ ] Flugmodus an, die App ganz schliessen und neu oeffnen: startet sie, und
      laesst sich das Menuett vorspielen?
- [ ] Flugmodus wieder aus.

## D. Ohne Klavier: wie schnell rechnet das iPad ein Akkordmodell?

Geht jederzeit, auch unterwegs, und braucht kein Mikrofon. Gemessen wird Basic
Pitch, das Modell, das einmal zwei Haende hoeren koennte; Onsets and
Velocities darf wegen der GPL nicht auf die oeffentliche Seite.

- [ ] In Safari <https://felix25192.github.io/piano-trainer/model-test.html>
      oeffnen, **Messung starten**, etwa eine Minute warten, die Seite dabei
      offen und das iPad wach lassen.
- [ ] **Ergebnis kopieren** und in den Chat einfuegen. Falls dort "WEICHT AB"
      steht, ist das der wichtigste Satz darin.
- [ ] Vorher den Stromsparmodus ausschalten (Einstellungen → Batterie), er
      bremst den Prozessor; falls er an war, das dazuschreiben.

## E. MIDI am Kawai

Neu seit dem 10.11. Am Kawai muss das Mikrofon nicht der einzige Weg sein: ueber
MIDI kommt jede Taste exakt an, beide Haende zugleich. In der App ist das
gebaut und gegen ein nachgestelltes Keyboard geprueft. Ob die echten Geraete
zusammenfinden, ist ungeprueft.

Am Laptop, falls er ans Kawai kommt. Hier wird MIDI zum Zeugen: Es schreibt
mit, welche Tasten wirklich gedrueckt wurden, waehrend das Mikrofon hoert. Das
misst, wie viel spaeter das Mikrofon einen Anschlag bemerkt, und ist das
genaueste Material fuer die zwei Haende.

- [ ] Das Kawai per USB-Kabel (Buchse "USB to Host") an den Laptop. Notieren,
      ob Windows nach einem Treiber oder nach Adminrechten fragt.
- [ ] In Chrome oder Edge die App oeffnen, ein Stueck waehlen, unten auf den
      Knopf **MIDI** tippen und den Zugriff erlauben. Leuchtet er, und
      nennt das Zahnrad unter "MIDI" das Kawai?
- [ ] Tonleiter C-Dur, 1 Oktave, Parallel, **beide Haende**: _ von 15.
- [ ] Bach, Menuett G-Dur, beide Haende, Takt 1 bis 8: bis Takt _.
- [ ] Das Kawai aus- und wieder einschalten, ohne die App anzufassen: geht es
      danach weiter?
- [ ] Zahnrad → **Mitschnitt** ein. Erst **MIDI**, dann **Mikrofon**
      einschalten: Auf dem MIDI-Knopf steht jetzt "MIDI schreibt mit". Die
      Tonleiter rechte Hand einmal auf und ab, dann das Menuett Takt 1 bis 8
      **mit beiden Haenden**. Die Markierung bleibt dabei am ersten Akkord
      stehen, das ist richtig so: Es geht nur um die Aufnahme. Mikrofon aus,
      Mitschnitt sichern.

Am iPad, ohne Geld:

- [ ] Den "Web MIDI Browser" aus dem App Store laden und darin
      <https://felix25192.github.io/piano-trainer/> oeffnen. Erscheint unten
      der Knopf **MIDI**? Wenn nicht, ist hier Schluss, und das ist auch ein
      Ergebnis.
- [ ] Das Kawai per USB-Kabel ans iPad, je nach iPad mit Adapter, oder ueber
      Bluetooth, falls die App das anbietet. Dann derselbe Durchgang wie am
      Laptop: _ von 15.

## F. Material fuer zwei Haende

Wenn noch Zeit ist, an beiden Instrumenten. Der Tempo-Modus laeuft weiter,
auch wenn das Mikrofon die Akkorde nicht versteht, und legt die Aufnahme so
genau neben die Noten.

- [ ] Mitschnitt an. Stuecke → Bach, Menuett G-Dur, **beide Haende**. Takt →
      Schleife Takt 1 bis 8. Zahnrad → Tempo beim Spielen im Tempo auf 50.
- [ ] Mikrofon an, dann **Tempo 50**: einzaehlen lassen, die acht Takte
      durchspielen, so gut es geht. Die Zeichen danach sind egal, das
      Mikrofon hoert ja nur eine Hand. Mikrofon aus, Mitschnitt sichern.
- [ ] Dasselbe einmal **mit Pedal**, wie du es spielen wuerdest.

## Zurueckmelden

Die Tabelle aus A, die Antworten aus B, C und E, die iPadOS-Version und die
Notizen zur Vorbereitung, dazu die Liste "Durchgang, Instrument, Uhrzeit".

Die Aufnahmen: den Ordner vom iPad auf den Laptop bringen, wie es am
einfachsten ist (OneDrive-App, Mail an dich selbst, iCloud im Browser), und
nach `lab/local/testrunde/` im Projekt legen. Git ignoriert den Ordner, sie
landen also nicht im oeffentlichen Repository. Je Durchgang sind es zwei
Dateien: der Klang als WAV und das Protokoll als JSON.

Fuer einen schnellen Blick ohne Dateien: Zahnrad → **Protokoll der letzten
Sitzung kopieren**, und hier einfuegen. Einfach in den Chat, die
Auswertung kommt danach in `PLAN.md`.
