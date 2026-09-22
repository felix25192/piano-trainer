/**
 * What counts as a score file, and what to call it.
 *
 * Pure string handling, no browser and no file system — the reading and
 * storing of actual files lives in src/adapters/scoreLibrary.ts.
 */

/**
 * Extensions MusicXML comes in.
 *
 * `.mxl` is the zipped container, `.musicxml` the current plain one, and
 * `.xml` the older plain one that most exporters still produce.
 */
export const SCORE_EXTENSIONS = [".mxl", ".musicxml", ".xml"] as const;

/** True when the name ends in an extension the app can open. */
export function isScoreFilename(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return SCORE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The `accept` attribute for a file picker. */
export function scoreFileAccept(): string {
  return SCORE_EXTENSIONS.join(",");
}

/**
 * Turns a file name into something readable in a list of pieces.
 *
 * Files from score sites arrive as `Sonate_No._14_Moonlight_1st_Movement.mxl`,
 * so underscores become spaces and the extension goes. The result is only a
 * fallback: once the file is parsed, a title from inside the score is better,
 * and many files carry one.
 */
export function titleFromFilename(name: string): string {
  let base = name.trim();

  // Strip a path, in case the browser hands over more than the bare name.
  const lastSlash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  if (lastSlash >= 0) base = base.slice(lastSlash + 1);

  const lower = base.toLowerCase();
  for (const ext of SCORE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      base = base.slice(0, base.length - ext.length);
      break;
    }
  }

  const cleaned = base
    .replace(/[_+]+/g, " ")
    // "Sonate No. 14" keeps its dots, but a run of them is a separator.
    .replace(/\.{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : "Ohne Titel";
}
