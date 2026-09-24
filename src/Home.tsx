import type { ReactNode } from "react";
import "./Home.css";

/**
 * The screen the app opens on: pick a kind of practice, or step straight back
 * into whatever was open last.
 *
 * It decides nothing. Every card reports which mode was tapped and the shell
 * takes it from there, which is what keeps this file free of OSMD, storage and
 * the engine — it is a menu, and menus should stay dumb.
 */

/** A mode that can actually be entered. */
export type ModeId = "pieces" | "exercises";

interface Mode {
  /** null for a mode that is listed but not built yet. */
  id: ModeId | null;
  title: string;
  hint: string;
  icon: ReactNode;
  /**
   * A page to open instead of entering a mode.
   *
   * For the one that is not built yet: the card would otherwise be a dead
   * end, and the device test it leads to is impossible to find if it lives
   * only in a link someone has to be told. A card you can see beats an
   * address you have to be sent.
   */
  href?: string;
}

/*
 * Line icons rather than the musical glyphs from the font: those are drawn for
 * running text and arrive at whatever size and weight the system font happens
 * to give them, which is not the same on iOS and on Windows.
 */
const noteIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9.6 17.4V6l10-2v11.4" />
    <circle cx="7" cy="17.4" r="2.7" className="filled" />
    <circle cx="17" cy="15.4" r="2.7" className="filled" />
  </svg>
);

const scaleIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 20h3.5v-4H10v-4h3.5V8H17V4h4" />
  </svg>
);

const micIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3" />
  </svg>
);

/**
 * The modes, in the order they are offered.
 *
 * A new one is a new entry here plus a case in the shell; nothing else on this
 * screen has to change, and the grid simply grows another card.
 */
const MODES: Mode[] = [
  {
    id: "pieces",
    title: "Stücke",
    hint: "Sieben gestufte Stücke zum Blattlesen, dazu eigene MusicXML-Dateien vom Gerät.",
    icon: noteIcon,
  },
  {
    id: "exercises",
    title: "Tonleitern & Übungen",
    hint: "Vierundzwanzig Tonarten, ein bis vier Oktaven, parallel oder in Gegenbewegung.",
    icon: scaleIcon,
  },
  {
    id: null,
    title: "Mit dem Mikrofon",
    hint:
      "Üben ohne Kabel: das Mikrofon hört beim Spielen mit — der Knopf dafür sitzt unten in den Noten. Einstimmig, also eine Hand zur Zeit: oben „rechte Hand“ oder „linke Hand“ wählen. Hier geht es zum Gerätetest.",
    icon: micIcon,
    // BASE_URL is "/" in development and "/piano-trainer/" in the build.
    href: `${import.meta.env.BASE_URL}mic-test.html`,
  },
];

interface HomeProps {
  /** Title of the piece that was open last, or null when there is none. */
  resume: string | null;
  onResume: () => void;
  onPick: (mode: ModeId) => void;
}

export default function Home({ resume, onResume, onPick }: HomeProps) {
  return (
    <main className="home">
      <div className="hello">
        <h1>Piano Trainer</h1>
        <p>Die Noten laufen weiter, sobald der richtige Ton klingt.</p>
        <div className="staff" aria-hidden="true" />
      </div>

      {/*
        Sitting down at the piano usually means carrying on with the same piece,
        so it gets the one card above everything else instead of a place in the
        list. Within a session it even keeps the bar you had reached.
      */}
      {resume && (
        <button className="resume" onClick={onResume}>
          <span className="text">
            <span className="eyebrow">Weiter üben</span>
            <span className="name">{resume}</span>
          </span>
          <span className="arrow" aria-hidden="true">
            →
          </span>
        </button>
      )}

      <div className="modes">
        {MODES.map((mode) => {
          const inside = (
            <>
              <span className="glyph">{mode.icon}</span>
              <span className="title">{mode.title}</span>
              <span className="hint">{mode.hint}</span>
              {mode.href && (
                <span className="badge">Gerätetest öffnen →</span>
              )}
            </>
          );

          // A real link, not a button that navigates: it can be opened in
          // its own tab, and it survives being added to a home screen.
          return mode.href ? (
            <a key={mode.title} className="mode aside" href={mode.href}>
              {inside}
            </a>
          ) : (
            <button
              key={mode.title}
              className="mode"
              onClick={() => {
                if (mode.id) onPick(mode.id);
              }}
            >
              {inside}
            </button>
          );
        })}
      </div>

      <p className="colophon">
        Alles bleibt auf diesem Gerät. Kein Konto, keine Punkte, keine Streaks.
      </p>
    </main>
  );
}
