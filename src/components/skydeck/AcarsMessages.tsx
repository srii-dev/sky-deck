import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AIRFRAMES_ATTRIBUTION,
  AIRFRAMES_SITE_URL,
  buildMessagesUrl,
  fetchAircraftMessages,
  type AcarsFetchResult,
} from "@/lib/airframes-client";
import type { AcarsMessage } from "@/lib/acars-messages";

export const ACARS_DISCLOSURE =
  "Loading contacts Airframes directly from your browser, so Airframes can see your IP address.";
export const ACARS_NOTICE =
  "Received by volunteers: can be incomplete or wrong, and may contain sensitive details. Educational use only. Nothing is stored here.";

type State =
  { status: "idle" } | { status: "loading" } | { status: "done"; result: AcarsFetchResult };

function formatTime(ms: number | null): string {
  if (ms == null) return "time unknown";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageRow({ m }: { m: AcarsMessage }) {
  const route = m.departing && m.destination ? `${m.departing} -> ${m.destination}` : null;
  const meta = [
    formatTime(m.time),
    m.label ? `label ${m.label}` : null,
    m.frequency != null ? `${m.frequency} MHz` : null,
    route,
  ].filter(Boolean);
  return (
    <li className="rounded border border-border/40 bg-background/40 px-2 py-1.5">
      <div className="text-[11px] text-muted-foreground">{meta.join(" | ")}</div>
      {m.text ? (
        // Plain text only: React escapes it, and it is never inserted as HTML.
        <pre className="data-value mt-1 whitespace-pre-wrap break-words text-xs">{m.text}</pre>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground">(no text)</div>
      )}
    </li>
  );
}

/**
 * Recent ACARS messages for one aircraft, loaded only when the user asks (saves the request budget and avoids
 * silent requests). `load` can be replaced in tests.
 */
export function AcarsMessages({
  hex,
  load = fetchAircraftMessages,
}: {
  hex: string;
  load?: (hex: string) => Promise<AcarsFetchResult>;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  // Mock and non-ICAO identifiers have no ACARS messages to look up.
  if (buildMessagesUrl(hex) === null) return null;

  const run = async () => {
    setState({ status: "loading" });
    const result = await load(hex);
    setState({ status: "done", result });
  };
  const loading = state.status === "loading";

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-background/40 px-3 py-3">
      <div className="hud-label">ACARS messages</div>

      {state.status === "idle" && (
        <p className="text-[11px] leading-snug text-muted-foreground">{ACARS_DISCLOSURE}</p>
      )}

      {state.status === "done" && state.result.ok && (
        <>
          <p className="text-xs text-muted-foreground">
            {state.result.messages.length === 0
              ? "No ACARS messages heard for this aircraft in the last 24 hours."
              : `${state.result.messages.length} most recent message${state.result.messages.length === 1 ? "" : "s"} (last 24 hours)`}
          </p>
          {state.result.messages.length > 0 && (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {state.result.messages.map((m) => (
                <MessageRow key={m.id} m={m} />
              ))}
            </ul>
          )}
        </>
      )}

      {state.status === "done" && !state.result.ok && (
        <p className="text-xs font-medium text-destructive">{state.result.error}</p>
      )}

      <Button variant="hud" size="sm" onClick={run} disabled={loading}>
        {loading
          ? "Loading..."
          : state.status === "idle"
            ? "Load ACARS messages"
            : state.result.ok
              ? "Refresh"
              : "Try again"}
      </Button>

      <p className="text-[10px] leading-snug text-muted-foreground/80">
        {ACARS_NOTICE}{" "}
        <a
          href={AIRFRAMES_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary"
        >
          {AIRFRAMES_ATTRIBUTION}
        </a>
        .
      </p>
    </div>
  );
}
