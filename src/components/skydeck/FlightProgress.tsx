import type { FlightView } from "@/hooks/use-flight-stages";
import { fmtRange } from "@/lib/glide-ring";
import { STAGE_LABELS, STEP_NAMES, sinceText } from "@/lib/flight-stage";
import type { UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";

/* One tracked flight (Phase 11a): its stage on a seven step bar, the route, a rough time to go and the last changes. */

function etaText(min: number): string {
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? h + " h" : h + " h " + m + " min";
}

export function FlightProgress({
  view,
  units,
  now,
}: {
  view: FlightView;
  units: UnitSystem;
  now: number;
}) {
  const r = view.result;
  const route = view.route;
  const code = (a: { iata: string | null; icao: string | null }) => a.iata ?? a.icao ?? "?";
  const recent = view.changes.slice(-3).reverse();
  if (!r) {
    return (
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        <div>Not in the area the map has loaded right now.</div>
        {recent[0] && (
          <div>
            Last seen: {STAGE_LABELS[recent[0].stage].toLowerCase()}, {sinceText(recent[0].at, now)}
            .
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="mt-1.5 space-y-1.5" aria-label={view.callsign + " progress"}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="data-value">{r.label}</span>
        {route && (
          <span className="truncate text-xs text-muted-foreground">
            {code(route.origin)} → {code(route.destination)}
          </span>
        )}
      </div>
      <div
        className="flex gap-0.5"
        role="img"
        aria-label={"Step " + (r.step + 1) + " of 7: " + STEP_NAMES[r.step]}
      >
        {STEP_NAMES.map((n, i) => (
          <div
            key={n}
            title={n}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < r.step ? "bg-primary/60" : i === r.step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground" aria-hidden>
        <span>{STEP_NAMES[0]}</span>
        <span>{STEP_NAMES[3]}</span>
        <span>{STEP_NAMES[6]}</span>
      </div>
      {r.remainingNm != null && (
        <div className="text-xs text-muted-foreground">
          About {fmtRange(r.remainingNm, units)} to go on the straight line
          {r.etaMin != null ? ", roughly " + etaText(r.etaMin) + " at the current speed" : ""}.
        </div>
      )}
      {recent.length > 1 && (
        <div className="text-[11px] text-muted-foreground">
          {recent.map((c) => STAGE_LABELS[c.stage] + " " + sinceText(c.at, now)).join(" · ")}
        </div>
      )}
    </div>
  );
}
