/** Small helpers the shell's parts share. */

export function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Avoids 1.7999999999999998 from repeated floating point addition. */
export function round(z: number): number {
  return Math.round(z * 10) / 10;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
