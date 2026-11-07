import { createDedupe, describeError } from "./client-error";
import { reportClientErrorFn } from "./client-error.functions";

const shouldSend = createDedupe(60_000);

/** Send an error that reached an error boundary to the server log. Never throws. */
export function reportClientError(error: unknown, boundary: string): void {
  if (typeof window === "undefined") return;
  try {
    const { message, stack } = describeError(error);
    if (!shouldSend(`${boundary}:${message}`, Date.now())) return;
    void reportClientErrorFn({
      data: {
        message: message.slice(0, 2000),
        ...(stack ? { stack: stack.slice(0, 10_000) } : {}),
        boundary,
        path: window.location.pathname,
      },
    }).catch(() => {});
  } catch {
    // Reporting must never cause another error.
  }
}
