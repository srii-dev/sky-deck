import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { explainAirport } from "@/lib/airport-ai.functions";
import { AI_LABEL } from "@/lib/ai-service";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "failed"; error: string };

/** On-demand AI rewrite of the rule-based airport brief. Nothing is sent until the button is pressed. */
export function AirportAiBrief({
  icao,
  name,
  brief,
}: {
  icao: string;
  name: string;
  brief: string;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  // A different airport makes an earlier answer stale. Not the brief: its traffic counts change every few seconds.
  useEffect(() => setState({ status: "idle" }), [icao]);

  const run = () => {
    setState({ status: "loading" });
    explainAirport({ data: { icao, name, brief } }).then(
      (r) =>
        setState(r.ok ? { status: "done", text: r.text } : { status: "failed", error: r.error }),
      () => setState({ status: "failed", error: "AI description unavailable." }),
    );
  };

  return (
    <div className="space-y-1">
      {state.status === "done" ? (
        <>
          <p className="text-sm">{state.text}</p>
          <p className="text-xs text-muted-foreground">
            {AI_LABEL}: a rewrite of the brief above by an AI model (Workers AI or Gemini). It can
            be wrong; the data below is the source.
          </p>
        </>
      ) : (
        <>
          <Button variant="panel" size="sm" onClick={run} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Writing…" : "Explain with AI"}
          </Button>
          {state.status === "failed" && (
            <p className="text-xs text-muted-foreground">{state.error}</p>
          )}
        </>
      )}
    </div>
  );
}
