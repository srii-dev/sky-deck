/*
 * Browser error reports (Phase 21c). Plain functions only, so they can be tested and used on both
 * sides. The server function in client-error.functions.ts logs what comes out of here.
 * Privacy: reports carry no user identifiers; query strings and fragments are stripped from the
 * page path and from any URL inside a stack trace.
 */

export const CLIENT_ERROR_LIMITS = {
  message: 500,
  stack: 4000,
  boundary: 100,
  path: 200,
} as const;

export interface ClientErrorReport {
  message: string;
  stack?: string | undefined;
  boundary?: string | undefined;
  path?: string | undefined;
}

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/** Remove `?query` and `#fragment` from a path or URL. */
export function stripQuery(value: string): string {
  return value.replace(/[?#][^\s)'"]*/g, "");
}

/** Turn anything that was thrown into a short, safe report. */
export function cleanClientError(input: {
  message: string;
  stack?: string | undefined;
  boundary?: string | undefined;
  path?: string | undefined;
}): ClientErrorReport {
  const report: ClientErrorReport = {
    message: cut(stripQuery(input.message), CLIENT_ERROR_LIMITS.message),
  };
  if (input.stack) report.stack = cut(stripQuery(input.stack), CLIENT_ERROR_LIMITS.stack);
  if (input.boundary) report.boundary = cut(input.boundary, CLIENT_ERROR_LIMITS.boundary);
  if (input.path) report.path = cut(stripQuery(input.path), CLIENT_ERROR_LIMITS.path);
  return report;
}

export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return error.stack
      ? { message: error.message, stack: error.stack }
      : { message: error.message };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

/** Sliding-window limiter: at most `max` reports per `windowMs`. State is per server instance. */
export function createReportLimiter(max: number, windowMs: number) {
  let times: number[] = [];
  return {
    allow(now: number): boolean {
      times = times.filter((t) => now - t < windowMs);
      if (times.length >= max) return false;
      times.push(now);
      return true;
    },
    reset() {
      times = [];
    },
  };
}

/** Browser side: skip a report that repeats the same message within `windowMs`. */
export function createDedupe(windowMs: number) {
  const seen = new Map<string, number>();
  return (key: string, now: number): boolean => {
    for (const [k, t] of seen) if (now - t > windowMs) seen.delete(k);
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  };
}
