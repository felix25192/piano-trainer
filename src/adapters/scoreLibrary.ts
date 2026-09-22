import { isScoreFilename, titleFromFilename } from "../core/scoreFile";

/**
 * Stores the pieces the user brought along, so they survive closing the tab.
 *
 * IndexedDB rather than localStorage: it holds a Blob as it is, while
 * localStorage would need the file base64-encoded into a string, growing it by
 * a third and pressing against a quota of a few megabytes. A compressed score
 * runs to tens of kilobytes and an uncompressed one to several hundred, so a
 * shelf of pieces would hit that ceiling.
 *
 * Everything here is infrastructure. The decisions — what a score file is,
 * what to call it — live in src/core/scoreFile.ts, where they are tested.
 */

const DB_NAME = "piano-trainer";
const DB_VERSION = 1;
const STORE = "scores";

/** What a list of pieces shows. Deliberately without the file itself. */
export interface LibraryEntry {
  id: string;
  title: string;
  filename: string;
  /** Milliseconds since the epoch. */
  addedAt: number;
  /** Bytes, for the settings list. */
  size: number;
}

interface StoredScore extends LibraryEntry {
  blob: Blob;
}

/** Thrown for anything the user could plausibly have caused. */
export class LibraryError extends Error {}

export function isLibrarySupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isLibrarySupported()) {
      reject(new LibraryError("Dieser Browser kann keine Stücke speichern."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new LibraryError("Der Speicher für Stücke ließ sich nicht öffnen."));
    // Fires in a private window, or when storage is blocked entirely.
    request.onblocked = () =>
      reject(new LibraryError("Der Speicher ist von einem anderen Tab belegt."));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(new LibraryError("Der Zugriff auf den Speicher schlug fehl."));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Every stored piece, newest first. */
export async function listScores(): Promise<LibraryEntry[]> {
  const rows = await run<StoredScore[]>("readonly", (store) => store.getAll());
  return rows
    .map(({ blob: _blob, ...entry }) => entry)
    .sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * Stores a file the user picked.
 *
 * The file is kept as handed over, without being parsed first — OSMD accepts a
 * Blob and copes with both the plain and the zipped form, so re-implementing
 * that here would only add a way to be wrong.
 */
export async function addScore(file: File): Promise<LibraryEntry> {
  if (!isScoreFilename(file.name)) {
    throw new LibraryError(
      `„${file.name}" ist keine MusicXML-Datei. Erwartet werden .mxl, .musicxml oder .xml.`,
    );
  }
  if (file.size === 0) {
    throw new LibraryError(`„${file.name}" ist leer.`);
  }

  const record: StoredScore = {
    id: newId(),
    title: titleFromFilename(file.name),
    filename: file.name,
    addedAt: Date.now(),
    size: file.size,
    blob: file,
  };

  await run("readwrite", (store) => store.put(record));

  const { blob: _blob, ...entry } = record;
  return entry;
}

/** The stored file itself, for handing to OSMD. Null when it is gone. */
export async function getScoreBlob(id: string): Promise<Blob | null> {
  const row = await run<StoredScore | undefined>("readonly", (store) => store.get(id));
  return row?.blob ?? null;
}

export async function removeScore(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}

function newId(): string {
  // randomUUID needs a secure context, which a home-screen web app has — but
  // a plain-http dev server on a phone does not.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
