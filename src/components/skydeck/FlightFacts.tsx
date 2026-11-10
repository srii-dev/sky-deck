import type { Aircraft, FlightRoute } from "@/lib/aircraft";
import { flightFacts } from "@/lib/flight-facts";
import { fmtRange } from "@/lib/glide-ring";
import type { UnitSystem } from "@/lib/units";

/* Flight facts (Phase 14a): phase, how far along the route, time to the destination, and which way the nose points. */

function durationText(min: number): string {
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? h + " h" : h + " h " + m + " min";
}

function clockText(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function FlightFacts({
  aircraft: a,
  route,
  units,
}: {
  aircraft: Aircraft;
  route: FlightRoute | null | undefined;
  units: UnitSystem;
}) {
  const f = flightFacts(
    a,
    route ? { origin: route.origin, destination: route.destination } : null,
    Date.now(),
  );
  const rows: { label: string; value: string; note?: string }[] = [
    { label: "Phase", value: f.stage.label },
  ];
  if (f.route) {
    rows.push({ label: "Route length", value: fmtRange(f.route.totalNm, units) });
    rows.push({
      label: "Along the route",
      value:
        Math.round(f.route.fraction * 100) +
        "% · " +
        fmtRange(f.route.flownNm, units) +
        " flown, " +
        fmtRange(f.route.remainingNm, units) +
        " to go",
    });
  }
  if (f.stage.etaMin != null && f.arrivalAt != null) {
    rows.push({
      label: "Time to destination",
      value: durationText(f.stage.etaMin),
      note: "About " + clockText(f.arrivalAt) + " your time, at the current ground speed",
    });
  }
  if (f.offDirectDeg != null && f.bearingToDestDeg != null) {
    const off = Math.round(Math.abs(f.offDirectDeg));
    rows.push({
      label: "Heading",
      value:
        off <= 10
          ? "Straight for the destination"
          : off + "° " + (f.offDirectDeg > 0 ? "right" : "left") + " of the destination",
      note: "Destination bears " + Math.round(f.bearingToDestDeg) + "°",
    });
  }
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-3">
      <div className="hud-label mb-2">Flight facts</div>
      {f.route && (
        <div
          className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Progress along the route"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(f.route.fraction * 100)}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: f.route.fraction * 100 + "%" }}
          />
        </div>
      )}
      <dl className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 text-right">
              {r.value}
              {r.note && <span className="block text-[11px] text-muted-foreground">{r.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {f.stage.routeMismatch
          ? "The route on file does not match where this aircraft is (route data can be weeks old), so route facts are hidden. "
          : ""}
        Estimates from the broadcast position and a straight line to the destination, without winds
        or air traffic control.
      </p>
    </div>
  );
}
