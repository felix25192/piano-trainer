/**
 * Hands files to the user: the share sheet where the browser offers one for
 * files — on the iPad that is Files, Mail, AirDrop and whatever apps are
 * installed — and a plain download everywhere else.
 */
export async function shareFiles(files: File[], title: string): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files }) && nav.share) {
    try {
      await nav.share({ files, title });
      return;
    } catch (e: unknown) {
      // Closing the sheet is a choice, not a failure; anything else falls back.
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  for (const file of files) download(file);
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  // Long enough for the download to have started.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
