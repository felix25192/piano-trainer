/*
 * Basic Pitch für chord-lab.html: lädt das Modell, misst die Rechenzeit, und
 * beantwortet je Anschlag, was um ihn herum angeschlagen wurde und klingt.
 * Der Prüfstand kennt nur diese Schnittstelle; ein anderes Modell bringt ein
 * eigenes model.js mit denselben Ausfuhren.
 */
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import { loadGraphModel } from "@tensorflow/tfjs-converter";

export const name = "Basic Pitch (Spotify, Apache 2.0)";

// Fest im Modell: 22050 Hz, ein Fenster von zwei Sekunden minus einem Hop,
// heraus kommen 172 Bilder zu je 256 Samples und je Bild 88 Tasten ab A0.
export const RATE = 22050;
const WINDOW = 43844;
const HOP = 256;
const FRAMES = 172;
const KEYS = 88;
const A0 = 21;

let model;
let offset = 0;

/** Die WINDOW Samples, die zur Zeit `end` enden; vor dem Anfang Stille. */
function windowEnding(signal, end) {
  const w = new Float32Array(WINDOW);
  const last = Math.round(end * RATE);
  for (let i = 0; i < WINDOW; i++) {
    const j = last - WINDOW + i;
    if (j >= 0 && j < signal.length) w[i] = signal[j];
  }
  return w;
}

/**
 * Ein Fenster; die Anschlagswerte, 172 × 88, und daran als `.frames` die für
 * "klingt".
 *
 * Nie mehrere Fenster in einem Aufruf, obwohl das Modell eine Stapelgröße
 * annimmt: mit mehreren lieferte "klingt" nur noch 0,09 und 0,10 im Wechsel,
 * mit einem stimmte es. Spotifys eigener Code ruft es ebenfalls nur mit einem
 * Fenster auf. `prepare` vergleicht beides bei jedem Lauf.
 */
async function infer(w) {
  const input = tf.tensor3d(w, [1, WINDOW, 1]);
  const [onsets, frames] = model.execute(input, ["Identity_2", "Identity_1"]);
  const [on, fr] = await Promise.all([onsets.data(), frames.data()]);
  tf.dispose([input, onsets, frames]);
  on.frames = fr;
  return on;
}

/** Dasselbe gestapelt, nur für die Kontrolle. */
async function inferStacked(windows) {
  const flat = new Float32Array(windows.length * WINDOW);
  windows.forEach((w, b) => flat.set(w, b * WINDOW));
  const input = tf.tensor3d(flat, [windows.length, WINDOW, 1]);
  const [onsets, frames] = model.execute(input, ["Identity_2", "Identity_1"]);
  const [on, fr] = await Promise.all([onsets.data(), frames.data()]);
  tf.dispose([input, onsets, frames]);
  return windows.map((_, b) => {
    const out = on.subarray(b * FRAMES * KEYS, (b + 1) * FRAMES * KEYS);
    out.frames = fr.subarray(b * FRAMES * KEYS, (b + 1) * FRAMES * KEYS);
    return out;
  });
}

/** Das Bild, in dem ein Anschlag zur Zeit `at` liegt, wenn das Fenster bei `end` endet. */
const frameOf = (at, end) => Math.round((at - (end - WINDOW / RATE)) * (RATE / HOP)) + offset;

/** Wie sicher das Modell ist, dass `midi` um Bild k herum angeschlagen wurde: das Höchste über ±2 Bilder. */
function struckAt(out, k, midi) {
  let best = 0;
  for (let j = k - 2; j <= k + 2; j++) {
    if (j >= 0 && j < FRAMES) best = Math.max(best, out[j * KEYS + midi - A0]);
  }
  return best;
}

/** Wie sicher das Modell ist, dass `midi` kurz nach Bild k klingt: das Höchste über die nächsten 4 Bilder. */
function soundingAt(out, k, midi) {
  let best = 0;
  for (let j = k + 1; j <= k + 4; j++) {
    if (j >= 0 && j < FRAMES) best = Math.max(best, out.frames[j * KEYS + midi - A0]);
  }
  return best;
}

function renderer() {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unbekannt";
}

/** Ein Fenster, gemessen von der Eingabe bis die Zahlen im Speicher sind. */
async function timing(backend, runs) {
  await tf.setBackend(backend);
  await tf.ready();
  const input = tf.randomUniform([1, WINDOW, 1], -0.1, 0.1);
  const once = async () => {
    const t0 = performance.now();
    const out = model.execute(input, "Identity_2");
    await out.data();
    out.dispose();
    return performance.now() - t0;
  };
  for (let i = 0; i < 3; i++) await once();
  const times = [];
  for (let i = 0; i < runs; i++) times.push(await once());
  input.dispose();
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/**
 * Laden, Rechenzeit messen, einmessen. `render(strikes, seconds)` rendert bei
 * RATE. Gibt die Zeilen zurück, die der Prüfstand oben zeigt.
 */
export async function prepare(render) {
  model = await loadGraphModel("/models/basic-pitch/model.json");
  const lines = [`WebGL: ${renderer()}`];
  lines.push(`Rechenzeit je Anschlag (ein Fenster, Median), webgl: ${(await timing("webgl", 15)).toFixed(0)} ms` +
    `, float32: ${tf.env().getBool("WEBGL_RENDER_FLOAT32_ENABLED")}`);
  lines.push(`Rechenzeit je Anschlag (ein Fenster, Median), cpu:   ${(await timing("cpu", 5)).toFixed(0)} ms`);
  await tf.setBackend("webgl");
  await tf.ready();

  /*
   * Vorher wissen, in welchem Bild das Modell einen Anschlag meldet, sonst
   * misst alles Weitere am falschen Bild. Gemessen mit viel Zeit nach dem
   * Anschlag, also da, wo das Modell am sichersten ist.
   */
  const probe = [36, 48, 55, 60, 64, 67, 72, 79, 84];
  const windows = [];
  for (const midi of probe) windows.push(windowEnding(await render([{ midi, at: 1 }], 2.1), 2.0));
  const outs = [];
  for (const w of windows) outs.push(await infer(w));
  const shifts = outs.map((out, i) => {
    const k = frameOf(1, 2.0);
    let best = k, top = -1;
    for (let j = k - 10; j <= k + 10; j++) {
      const v = out[j * KEYS + probe[i] - A0];
      if (v > top) { top = v; best = j; }
    }
    return best - k;
  });
  offset = Math.round(shifts.reduce((a, b) => a + b, 0) / shifts.length);
  lines.push(`Anschlag liegt ${offset} Bilder neben der Rechnung (je Ton: ${shifts.join(" ")}); so korrigiert.`);
  const held = outs.map((o, i) => soundingAt(o, frameOf(1, 2.0), probe[i]).toFixed(2));
  lines.push(`Kontrolle "klingt" beim gespielten Ton, sollte deutlich über 0,5 liegen: ${held.join(" ")}`);

  // Gestapelt gegen einzeln: wie weit weichen die Werte voneinander ab?
  const stacked = await inferStacked(windows);
  let onDiff = 0, frDiff = 0;
  stacked.forEach((s, i) => {
    for (let j = 0; j < FRAMES * KEYS; j++) {
      onDiff = Math.max(onDiff, Math.abs(s[j] - outs[i][j]));
      frDiff = Math.max(frDiff, Math.abs(s.frames[j] - outs[i].frames[j]));
    }
  });
  lines.push(`Kontrolle gestapelt gegen einzeln, größte Abweichung: angeschlagen ${onDiff.toFixed(3)}, klingt ${frDiff.toFixed(3)}`);
  return lines;
}

/**
 * Ein Anschlag zur Zeit `at` in `signal`, gefragt mit dem Fenster, das `delay`
 * danach endet. Je Taste ab A0: wie sicher sie angeschlagen wurde, und wie
 * sicher sie gleich danach klingt.
 */
export async function ask(signal, at, delay) {
  const out = await infer(windowEnding(signal, at + delay));
  const k = frameOf(at, at + delay);
  const struck = [], held = [];
  for (let midi = A0; midi < A0 + KEYS; midi++) {
    struck.push(struckAt(out, k, midi));
    held.push(soundingAt(out, k, midi));
  }
  return { struck, held };
}
