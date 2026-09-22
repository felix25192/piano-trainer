import type { Exercise, ExerciseNote } from "./exercises";
import { keySignatureAlterations, type Letter, type Pitch } from "./theory";

/**
 * Writes a generated exercise as MusicXML.
 *
 * Why go out through XML at all, when the engine works on its own note model?
 * Because the notes still have to be *drawn*, and OSMD draws MusicXML. Going
 * this way makes a generated exercise just another score: it loads, renders,
 * gets read back by the adapter and matched by the engine through exactly the
 * same path as a file from disk. Nothing downstream needs to know the
 * difference.
 */

/** Quarter notes throughout, so one division is one beat. */
const DIVISIONS = 1;
const BEATS_PER_MEASURE = 4;

/** MusicXML's names for the accidental signs. */
const ACCIDENTAL_NAMES: Record<number, string> = {
  [-2]: "flat-flat",
  [-1]: "flat",
  0: "natural",
  1: "sharp",
  2: "double-sharp",
};

export function exerciseToMusicXml(exercise: Exercise): string {
  const measures = Math.ceil(exercise.right.length / BEATS_PER_MEASURE);
  const signature = keySignatureAlterations(exercise.key.fifths);

  const body: string[] = [];
  for (let m = 0; m < measures; m++) {
    body.push(measure(exercise, m, signature));
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`,
    `<score-partwise version="3.1">`,
    `  <movement-title>${escapeXml(exercise.title)}</movement-title>`,
    `  <part-list>`,
    `    <score-part id="P1"><part-name>Klavier</part-name></score-part>`,
    `  </part-list>`,
    `  <part id="P1">`,
    ...body,
    `  </part>`,
    `</score-partwise>`,
    ``,
  ].join("\n");
}

function measure(
  exercise: Exercise,
  index: number,
  signature: Record<Letter, number>,
): string {
  const from = index * BEATS_PER_MEASURE;
  const right = exercise.right.slice(from, from + BEATS_PER_MEASURE);
  const left = exercise.left.slice(from, from + BEATS_PER_MEASURE);

  const lines: string[] = [`    <measure number="${index + 1}">`];

  if (index === 0) lines.push(attributes(exercise.key.fifths));

  /*
   * Accidentals are tracked per measure and per octave, the way an engraver
   * does it. A sign holds for the rest of the bar, so the raised seventh of a
   * harmonic minor scale is marked once when it appears and left bare when it
   * returns on the way down — printing it twice would look like an error.
   */
  lines.push(...staffNotes(right, 1, 1, signature));

  // Rewind to the start of the bar so the left hand is written over the same
  // beats rather than after them.
  lines.push(`      <backup><duration>${BEATS_PER_MEASURE * DIVISIONS}</duration></backup>`);
  lines.push(...staffNotes(left, 2, 2, signature));

  lines.push(`    </measure>`);
  return lines.join("\n");
}

function attributes(fifths: number): string {
  return [
    `      <attributes>`,
    `        <divisions>${DIVISIONS}</divisions>`,
    `        <key><fifths>${fifths}</fifths></key>`,
    `        <time><beats>${BEATS_PER_MEASURE}</beats><beat-type>4</beat-type></time>`,
    `        <staves>2</staves>`,
    `        <clef number="1"><sign>G</sign><line>2</line></clef>`,
    `        <clef number="2"><sign>F</sign><line>4</line></clef>`,
    `      </attributes>`,
  ].join("\n");
}

function staffNotes(
  notes: ExerciseNote[],
  staff: number,
  voice: number,
  signature: Record<Letter, number>,
): string[] {
  const lines: string[] = [];
  const stated = new Map<string, number>();

  for (const note of notes) {
    lines.push(noteElement(note, staff, voice, signature, stated));
  }

  // Pad a short final bar so the measure still adds up.
  for (let i = notes.length; i < BEATS_PER_MEASURE; i++) {
    lines.push(
      `      <note><rest/><duration>${DIVISIONS}</duration>` +
        `<voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`,
    );
  }

  return lines;
}

function noteElement(
  note: ExerciseNote,
  staff: number,
  voice: number,
  signature: Record<Letter, number>,
  stated: Map<string, number>,
): string {
  const { pitch, finger } = note;

  const parts = [`      <note>`, `        <pitch>`, `          <step>${pitch.step}</step>`];
  if (pitch.alter !== 0) parts.push(`          <alter>${pitch.alter}</alter>`);
  parts.push(`          <octave>${pitch.octave}</octave>`, `        </pitch>`);

  parts.push(
    `        <duration>${DIVISIONS}</duration>`,
    `        <voice>${voice}</voice>`,
    `        <type>quarter</type>`,
    `        <staff>${staff}</staff>`,
  );

  const sign = accidentalFor(pitch, signature, stated);
  if (sign) parts.push(`        <accidental>${sign}</accidental>`);

  if (finger !== undefined) {
    parts.push(
      `        <notations><technical><fingering>${finger}</fingering></technical></notations>`,
    );
  }

  parts.push(`      </note>`);
  return parts.join("\n");
}

/**
 * The accidental to print, or null when the note already sounds that way.
 *
 * What is "already in effect" is the key signature, unless a sign earlier in
 * the same bar and the same octave has overridden it.
 */
function accidentalFor(
  pitch: Pitch,
  signature: Record<Letter, number>,
  stated: Map<string, number>,
): string | null {
  const place = `${pitch.step}${pitch.octave}`;
  const inEffect = stated.get(place) ?? signature[pitch.step];

  if (pitch.alter === inEffect) return null;

  stated.set(place, pitch.alter);
  return ACCIDENTAL_NAMES[pitch.alter] ?? null;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
