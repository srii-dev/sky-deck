/*
 * Client-side file download (Phase 22l): build a Blob, point a temporary link at it and click it.
 * Nothing is uploaded. The document and URL API are parameters so tests can pass fakes.
 */

export interface DownloadDeps {
  doc?: Pick<Document, "createElement" | "body">;
  urlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  /** Called to free the object URL later; the default waits a moment so the browser can start the save. */
  later?: (fn: () => void) => void;
}

/** Returns false (and does nothing) when called outside a browser. */
export function downloadText(
  filename: string,
  mime: string,
  text: string,
  deps: DownloadDeps = {},
): boolean {
  const doc = deps.doc ?? (typeof document === "undefined" ? undefined : document);
  const urlApi = deps.urlApi ?? (typeof URL === "undefined" ? undefined : URL);
  if (!doc || !urlApi || typeof urlApi.createObjectURL !== "function") return false;
  const url = urlApi.createObjectURL(new Blob([text], { type: mime }));
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  (deps.later ?? ((fn) => void setTimeout(fn, 4000)))(() => urlApi.revokeObjectURL(url));
  return true;
}
