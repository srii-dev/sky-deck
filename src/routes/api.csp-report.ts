import { createFileRoute } from "@tanstack/react-router";

import { MAX_CSP_REPORT_BYTES, parseCspReports, readTextLimited } from "@/lib/csp-report";
import { createKeyedLimiter, visitorKey } from "@/lib/rate-limit";

/*
 * Receives Content-Security-Policy violation reports (Phase 17b) and writes one "[csp-report]" log line per report.
 * Stores nothing. Limits: 8 KB bodies, 10 requests a minute per visitor and 200 a minute per server instance.
 */
const perVisitor = createKeyedLimiter({ max: 10, windowMs: 60_000 });
const wholeInstance = createKeyedLimiter({ max: 200, windowMs: 60_000, maxKeys: 1 });
const quiet = { headers: { "Cache-Control": "no-store" } };

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 405, headers: { Allow: "POST", ...quiet.headers } }),
      POST: async ({ request }) => {
        const now = Date.now();
        if (
          !perVisitor.allow(
            visitorKey((n) => request.headers.get(n)),
            now,
          ).ok
        ) {
          return new Response(null, { status: 429, ...quiet });
        }
        if (!wholeInstance.allow("all", now).ok)
          return new Response(null, { status: 429, ...quiet });
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > MAX_CSP_REPORT_BYTES) return new Response(null, { status: 413, ...quiet });
        let text: string | null;
        try {
          // Stops reading as soon as the limit is passed, so a body without a length cannot fill memory.
          text = await readTextLimited(request.body, MAX_CSP_REPORT_BYTES);
        } catch {
          return new Response(null, { status: 400, ...quiet });
        }
        if (text === null) return new Response(null, { status: 413, ...quiet });
        for (const report of parseCspReports(text)) {
          // JSON.stringify keeps one report on one line, so a crafted value cannot fake log lines.
          console.warn("[csp-report]", JSON.stringify(report));
        }
        return new Response(null, { status: 204, ...quiet });
      },
    },
  },
});
