import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SiteFooter, SiteHeader } from "@/components/skydeck/SiteChrome";
import { Button } from "@/components/ui/button";
import { getStatus } from "@/lib/status.functions";
import type { ProbeState } from "@/lib/status-probes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Status — SkyDeck" },
      { name: "description", content: "Whether the services SkyDeck depends on are answering." },
    ],
  }),
  component: StatusPage,
});

const STATE_LABEL: Record<ProbeState, string> = {
  ok: "Working",
  slow: "Slow",
  blocked: "Refused",
  down: "Not answering",
  "not-configured": "Not set up",
  unused: "Not used",
};
const STATE_CLASS: Record<ProbeState, string> = {
  ok: "bg-success/15 text-success border-success/40",
  slow: "bg-warning/15 text-warning border-warning/40",
  blocked: "bg-destructive/15 text-destructive border-destructive/40",
  down: "bg-destructive/15 text-destructive border-destructive/40",
  "not-configured": "bg-muted text-muted-foreground border-border",
  unused: "bg-muted text-muted-foreground border-border",
};
const OVERALL: Record<"ok" | "degraded" | "down", string> = {
  ok: "Everything that is in use is answering.",
  degraded: "Some services are not answering. The map may show less data.",
  down: "No outside service is answering right now.",
};

function StatusPage() {
  const q = useQuery({
    queryKey: ["status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const r = q.data;
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-10">
        <h1 className="font-display text-2xl font-bold tracking-wide">Status</h1>
        <p className="text-sm text-muted-foreground">
          One small request to each outside service, asked at most once a minute. A service that is
          down here may still work for you, and the other way round.
        </p>
        {q.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
        {q.isError && (
          <p className="text-sm text-destructive" role="alert">
            The status check itself failed. Try again in a moment.
          </p>
        )}
        {r && (
          <>
            <p className="text-sm font-medium" role="status">
              {OVERALL[r.overall]}
            </p>
            <ul className="space-y-2">
              {r.results.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.usedFor}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.note}
                      {p.ms != null ? " · " + p.ms + " ms" : ""}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-2 py-0.5 text-xs font-medium",
                      STATE_CLASS[p.state],
                    )}
                  >
                    {STATE_LABEL[p.state]}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Checked {new Date(r.checkedAt).toLocaleTimeString()}.
            </p>
          </>
        )}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
          >
            {q.isFetching ? "Checking…" : "Check again"}
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
