import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { explainAirport } from "@/lib/airport-ai.functions";
import { AI_LABEL } from "@/lib/ai-service";

type State =
  | { status: "idle" }
  | { status: "loading" }
  // `basis` and `at`: the brief the answer was written from, and when it was asked.
  | { status: "done"; text: string; basis: string; at: number }
  | { status: "failed"; error: string };

/** On-demand AI rewrite of the rule-based airport brief. Nothing is sent until the button is pressed. */
export function AirportAiBrief({
  icao,
  name,
  brief,
  ready = true,
}: {
  icao: string;
  name: string;
  brief: string;
  /** False while the traffic for this view has not loaded: the brief would wrongly say no aircraft. */
  ready?: boolean;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  // A different airport makes an earlier answer stale. Not the brief: its traffic counts change every few seconds.
  useEffect(() => setState({ status: "idle" }), [icao]);

  const run = () => {
    setState({ status: "loading" });
    explainAirport({ data: { icao, name, brief } }).then(
      (r) =>
        setState(
          r.ok
            ? { status: "done", text: r.text, basis: brief, at: Date.now() }
            : { status: "failed", error: r.error },
        ),
      () => setState({ status: "failed", error: "AI description unavailable." }),
    );
  };

  return (
    <div className="space-y-1">
      {state.status === "done" ? (
        <>
          <p className="text-sm">{state.text}</p>
          <p className="text-xs text-muted-foreground">
            {AI_LABEL}: a rewrite of the brief as it was at{" "}
            {new Date(state.at).toISOString().slice(11, 16)} UTC
            {state.basis === brief ? "" : " (live traffic has changed since)"}, by an AI model
            (Workers AI or Gemini). It can be wrong; the data below is the source.
          </p>
          <Button variant="panel" size="sm" onClick={run}>
            Ask again
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="panel"
            size="sm"
            onClick={run}
            disabled={state.status === "loading" || !ready}
          >
            {state.status === "loading" ? "Writing…" : "Explain with AI"}
          </Button>
          {!ready && (
            <p className="text-xs text-muted-foreground">Waiting for the aircraft on the map…</p>
          )}
          {state.status === "failed" && (
            <p className="text-xs text-muted-foreground">{state.error}</p>
          )}
        </>
      )}
    </div>
  );
}
