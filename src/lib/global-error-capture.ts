/*
 * Errors that no error boundary sees (Phase 21c): a script error in an event handler or a timer, and a promise that
 * failed with nobody listening. They are sent to the same server log line as boundary errors. Noise that says nothing
 * useful is dropped, and a page sends at most a few, so a broken page cannot flood the log. Plain functions with the
 * window and the sender passed in, so tests need no browser.
 */

export const MAX_GLOBAL_REPORTS_PER_PAGE = 5;

type Listener = (event: unknown) => void;

export interface CaptureTarget {
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
}

export type SendReport = (error: unknown, boundary: string) => void;

/** Messages that carry no information we can act on. */
const NOISE = [
  /^ResizeObserver loop/i,
  /^Script error\.?$/i,
  /^Non-Error promise rejection captured/i,
  /^The operation was aborted/i,
  /^AbortError/i,
];

/** Code that does not belong to this site (browser extensions and the like). */
const FOREIGN_SOURCE = /^(chrome|moz|safari|webkit)-extension:\/\//i;

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "";
}

/** True when an error event or a rejection reason is not worth reporting. */
export function isNoise(message: string, source?: string | null): boolean {
  if (source && FOREIGN_SOURCE.test(source)) return true;
  return NOISE.some((re) => re.test(message.trim()));
}

/** Start listening. Returns a function that stops. */
export function installGlobalErrorCapture(target: CaptureTarget, send: SendReport): () => void {
  let sent = 0;
  const report = (error: unknown, boundary: string) => {
    if (sent >= MAX_GLOBAL_REPORTS_PER_PAGE) return;
    sent += 1;
    send(error, boundary);
  };

  const onError: Listener = (event) => {
    const e = event as { error?: unknown; message?: string; filename?: string };
    const message = e.message ?? messageOf(e.error);
    if (isNoise(message, e.filename)) return;
    report(e.error ?? message, "window-error");
  };

  const onRejection: Listener = (event) => {
    const reason = (event as { reason?: unknown }).reason;
    const message = messageOf(reason);
    if (isNoise(message)) return;
    // A rejection with nothing in it (undefined, an empty object) still says that something failed.
    report(reason ?? "Unhandled promise rejection", "unhandled-rejection");
  };

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
