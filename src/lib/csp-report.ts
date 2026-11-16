/*
 * Reads browser Content-Security-Policy violation reports (Phase 17b) and reduces each one to a few safe fields.
 * Pure and never throws: any body that is not a report gives an empty list. Both report formats are understood:
 * the old "application/csp-report" ({"csp-report": {...}}) and "application/reports+json" (a list of reports).
 * Nothing but the directive, the blocked ORIGIN (no path, no query) and the document PATH (no query) is kept, so a
 * log line cannot carry a visitor's address parameters or a crafted string.
 */

export const MAX_CSP_REPORT_BYTES = 8192;
const MAX_REPORTS = 5;

export interface CleanCspReport {
  directive: string;
  blocked: string;
  documentPath: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function originOf(value: string): string {
  if (!value) return "unknown";
  // Keywords the browser uses instead of an address.
  if (
    /^(inline|eval|data|blob|self|wasm-eval|trusted-types-policy|trusted-types-sink)$/i.test(value)
  ) {
    return value.toLowerCase();
  }
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "wss:"
      ? u.origin
      : u.protocol.replace(/[^a-z]/gi, "").slice(0, 12) || "unknown";
  } catch {
    return "unknown";
  }
}

function pathOf(value: string): string {
  try {
    return new URL(value).pathname.slice(0, 120);
  } catch {
    return "unknown";
  }
}

function clean(body: Record<string, unknown>): CleanCspReport | null {
  const directive = (
    str(body["effectiveDirective"]) ||
    str(body["effective-directive"]) ||
    str(body["violated-directive"]) ||
    str(body["violatedDirective"])
  )
    .split(/\s+/)[0]!
    .toLowerCase()
    .replace(/[^a-z-]/g, "")
    .slice(0, 40);
  if (!directive) return null;
  return {
    directive,
    blocked: originOf(str(body["blockedURL"]) || str(body["blocked-uri"])),
    documentPath: pathOf(str(body["documentURL"]) || str(body["document-uri"])),
  };
}

/** The body as text, or null as soon as it is larger than `max` bytes (the rest is not read). */
export async function readTextLimited(
  body: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export function parseCspReports(text: string): CleanCspReport[] {
  if (text.length === 0 || text.length > MAX_CSP_REPORT_BYTES) return [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const out: CleanCspReport[] = [];
  const add = (b: unknown) => {
    if (out.length >= MAX_REPORTS || !b || typeof b !== "object") return;
    const r = clean(b as Record<string, unknown>);
    if (r) out.push(r);
  };
  if (Array.isArray(json)) {
    for (const item of json) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "csp-violation"
      ) {
        add((item as { body?: unknown }).body);
      }
    }
  } else if (json && typeof json === "object") {
    add((json as Record<string, unknown>)["csp-report"]);
  }
  return out;
}
