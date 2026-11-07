import { createFileRoute } from "@tanstack/react-router";

/*
 * Uptime check target (Phase 21d). Answers 200 while the server can run code. It does not call
 * any data provider, so a provider outage never makes it fail, and it exposes no internal state.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { status: "ok", time: new Date().toISOString() },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
