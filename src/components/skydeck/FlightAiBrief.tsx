import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { explainFlight } from "@/lib/flight-ai.functions";
import { AI_LABEL } from "@/lib/ai-service";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "failed"; error: string };

/** On-demand AI brief of the selected flight from the panel's own facts. Nothing is sent until the button is pressed. */
export function FlightAiBrief({ hex, facts }: { hex: string; facts: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  // A different aircraft makes an earlier answer stale. Not the facts: altitude and speed change every few seconds.
  useEffect(() => setState({ status: "idle" }), [hex]);

  const run = () => {
    setState({ status: "loading" });
    explainFlight({ data: { facts } }).then(
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
            {AI_LABEL}: a summary of this flight&apos;s live data by an AI model (Workers AI or
            Gemini). It can be wrong; the data in this panel is the source.
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
