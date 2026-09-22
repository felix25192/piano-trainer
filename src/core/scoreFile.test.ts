import { describe, expect, it } from "vitest";
import { isScoreFilename, scoreFileAccept, titleFromFilename } from "./scoreFile";

describe("isScoreFilename", () => {
  it("accepts the three forms MusicXML comes in", () => {
    expect(isScoreFilename("piece.mxl")).toBe(true);
    expect(isScoreFilename("piece.musicxml")).toBe(true);
    expect(isScoreFilename("piece.xml")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isScoreFilename("  Piece.MXL  ")).toBe(true);
    expect(isScoreFilename("Piece.MusicXML")).toBe(true);
  });

  it("rejects what the app cannot open", () => {
    expect(isScoreFilename("scan.pdf")).toBe(false);
    expect(isScoreFilename("song.mid")).toBe(false);
    expect(isScoreFilename("song.midi")).toBe(false);
    expect(isScoreFilename("notes.txt")).toBe(false);
    expect(isScoreFilename("piece")).toBe(false);
    expect(isScoreFilename("")).toBe(false);
  });

  it("does not fall for an extension in the middle of the name", () => {
    expect(isScoreFilename("my.xml.backup")).toBe(false);
  });
});

describe("titleFromFilename", () => {
  it("drops the extension", () => {
    expect(titleFromFilename("Prelude.musicxml")).toBe("Prelude");
    expect(titleFromFilename("Prelude.MXL")).toBe("Prelude");
  });

  it("turns the underscores of score sites into spaces", () => {
    expect(titleFromFilename("Sonate_No._14_Moonlight_1st_Movement.mxl")).toBe(
      "Sonate No. 14 Moonlight 1st Movement",
    );
  });

  it("keeps a single dot but collapses a run of them", () => {
    expect(titleFromFilename("Op._27_No._2.xml")).toBe("Op. 27 No. 2");

    // Real name from musetrainer/library: the first dot belongs to the
    // abbreviation "Arrg.", the second starts the extension.
    expect(titleFromFilename("Ave_Maria_D839_-_Schubert_-_Solo_Piano_Arrg..mxl")).toBe(
      "Ave Maria D839 - Schubert - Solo Piano Arrg.",
    );

    // Three or more in a row are a separator someone typed, not punctuation.
    expect(titleFromFilename("Prelude..._Op_28.xml")).toBe("Prelude Op 28");
  });

  it("strips a path the browser may have included", () => {
    expect(titleFromFilename("C:\\Noten\\Bach\\Air.xml")).toBe("Air");
    expect(titleFromFilename("/home/felix/Air.xml")).toBe("Air");
  });

  it("collapses runs of whitespace", () => {
    expect(titleFromFilename("Air   on  the   G String.xml")).toBe("Air on the G String");
  });

  it("keeps a name that carries no extension", () => {
    expect(titleFromFilename("Nocturne")).toBe("Nocturne");
  });

  it("falls back rather than returning an empty label", () => {
    expect(titleFromFilename(".mxl")).toBe("Ohne Titel");
    expect(titleFromFilename("___.xml")).toBe("Ohne Titel");
    expect(titleFromFilename("   ")).toBe("Ohne Titel");
  });
});

describe("scoreFileAccept", () => {
  it("lists every supported extension for the file picker", () => {
    const accept = scoreFileAccept();
    expect(accept).toContain(".mxl");
    expect(accept).toContain(".musicxml");
    expect(accept).toContain(".xml");
  });
});
