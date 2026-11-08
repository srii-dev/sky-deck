import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAirportBrief } from "@/lib/airport.functions";
import type { FlightCategory } from "@/lib/airport-data";
import { airportTraffic, TRAFFIC_RADIUS_NM } from "@/lib/airport-traffic";
import type { Aircraft } from "@/lib/aircraft";
import type { Airport } from "@/lib/airports";
import { likelyRunways } from "@/lib/runway-wind";
import { fmtAltitude, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";

/*
 * Airport page (Phase 4a, 4b, 4d, 4f): weather, FAA delays, likely runway and nearby traffic.
 * Weather and FAA status come from the server; traffic is counted from the aircraft already on the map.
 */

interface Props {
  airport: Airport;
  aircraft: readonly Aircraft[];
  units: UnitSystem;
  onClose: () => void;
}

const CATEGORY_STYLE: Record<FlightCategory, string> = {
  VFR: "border-green-500/60 bg-green-500/15 text-green-400",
  MVFR: "border-blue-400/60 bg-blue-400/15 text-blue-300",
  IFR: "border-red-500/60 bg-red-500/15 text-red-400",
  LIFR: "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-300",
};

const FT_PER_M = 3.28084;

function utcTime(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toISOString().slice(11, 16) + " UTC";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="hud-label shrink-0">{label}</span>
      <span className="data-value text-right">{children}</span>
    </div>
  );
}

export function AirportPanel({ airport, aircraft, units, onClose }: Props) {
  const icao = airport.icao;
  const brief = useQuery({
    queryKey: ["airport-brief", icao],
    queryFn: () => getAirportBrief({ data: { icao, iata: airport.iata || null } }),
    enabled: icao.length >= 3,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const b = brief.data;
  const traffic = useMemo(() => airportTraffic(aircraft, airport), [aircraft, airport]);
  const metar = b?.metar ?? null;
  const info = b?.info ?? null;
  const runways = useMemo(() => info?.runways ?? [], [info]);
  const likely = useMemo(
    () => likelyRunways(runways, metar?.windDir ?? null, metar?.windKt ?? null),
    [runways, metar],
  );

  const wind = !metar
    ? "—"
    : metar.windKt == null
      ? "—"
      : metar.windKt === 0
        ? "Calm"
        : (metar.windVariable ? "Variable" : String(metar.windDir ?? "—").padStart(3, "0") + "°") +
          " at " +
          metar.windKt +
          " kt" +
          (metar.gustKt ? ", gusts " + metar.gustKt : "");

  return (
    <aside
      aria-label="Airport details"
      className={cn(
        "glass-panel pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-xl pb-[env(safe-area-inset-bottom)]",
        "md:absolute md:inset-x-auto md:bottom-4 md:right-14 md:z-30 md:w-[360px] md:rounded-lg md:pb-0",
      )}
      style={{ maxHeight: "min(70vh, calc(100dvh - var(--hud-h, 76px) - 8px))" }}
    >
      <div className="flex items-start gap-3 border-b border-border/60 p-4">
        <div className="min-w-0 flex-1">
          <div className="data-value truncate text-lg">{airport.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {airport.iata && <Badge variant="outline">{airport.iata}</Badge>}
            <Badge variant="outline">{airport.icao}</Badge>
            <span>{airport.city}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close airport details" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {brief.isPending && <p className="hud-label animate-pulse">Loading airport data…</p>}
        {brief.isError && (
          <p className="text-sm text-muted-foreground">
            Could not load airport data. Try again shortly.
          </p>
        )}

        {b && b.failed.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Some airport data did not load.</span>
            <Button
              variant="outline"
              size="sm"
              disabled={brief.isFetching}
              onClick={() => void brief.refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {b && (
          <>
            <section aria-label="FAA status" className="space-y-1">
              <div className="hud-label">FAA status</div>
              {b.nas === null ? (
                <p className="text-sm text-muted-foreground">
                  {b.failed.includes("nas")
                    ? "FAA status is not available right now."
                    : "No FAA status for this airport."}
                </p>
              ) : b.nas.length === 0 ? (
                <p className="text-sm">No FAA delays or closures reported.</p>
              ) : (
                b.nas.map((e, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{e.summary}</div>
                    {e.reason && (
                      <div className="mt-0.5 break-words text-xs text-muted-foreground">
                        {e.reason}
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>

            <section aria-label="Weather" className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="hud-label">Weather (METAR)</div>
                {metar?.flightCategory && (
                  <Badge variant="outline" className={CATEGORY_STYLE[metar.flightCategory]}>
                    {metar.flightCategory}
                  </Badge>
                )}
              </div>
              {metar ? (
                <>
                  <Row label="Wind">{wind}</Row>
                  <Row label="Visibility">{metar.visibility ? metar.visibility + " SM" : "—"}</Row>
                  <Row label="Temp / dew">
                    {metar.tempC != null ? Math.round(metar.tempC) + "°C" : "—"} /{" "}
                    {metar.dewpointC != null ? Math.round(metar.dewpointC) + "°C" : "—"}
                  </Row>
                  <Row label="Observed">{utcTime(metar.obsAt)}</Row>
                  <p className="break-words rounded-md bg-background/40 p-2 font-mono text-xs">
                    {metar.raw}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {b.failed.includes("weather")
                    ? "Weather is not available right now."
                    : "No METAR for this airport."}
                </p>
              )}
              {b.taf && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Forecast (TAF)</summary>
                  <p className="mt-1 break-words rounded-md bg-background/40 p-2 font-mono text-xs">
                    {b.taf.raw}
                  </p>
                </details>
              )}
            </section>

            <section aria-label="Runways" className="space-y-1.5">
              <div className="hud-label">Runways</div>
              {b.info?.elevM != null && (
                <Row label="Elevation">{fmtAltitude(b.info.elevM * FT_PER_M, units)}</Row>
              )}
              {likely ? (
                <p className="text-sm">
                  Likely in use: <strong>{likely.ends.map((e) => e.label).join(", ")}</strong>{" "}
                  <span className="text-muted-foreground">
                    (facing the wind, {likely.headwindKt} kt headwind). A guess from wind only; air
                    traffic control decides.
                  </span>
                </p>
              ) : (
                metar && (
                  <p className="text-sm text-muted-foreground">
                    No runway preferred by the wind right now.
                  </p>
                )
              )}
              {runways.length > 0 ? (
                <ul className="space-y-0.5 text-sm">
                  {runways.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3">
                      <span className="data-value">{r.id}</span>
                      <span className="text-muted-foreground">
                        {r.lengthFt != null ? r.lengthFt.toLocaleString("en-US") + " ft" : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {b.failed.includes("info")
                    ? "Runway data is not available right now."
                    : "No runway data."}
                </p>
              )}
            </section>
          </>
        )}

        <section aria-label="Nearby traffic" className="space-y-1.5">
          <div className="hud-label">Traffic within {TRAFFIC_RADIUS_NM} nm</div>
          <Row label="Aircraft">{traffic.nearby}</Row>
          <Row label="On the ground (3 nm)">{traffic.onGround}</Row>
          <Row label="Arriving (inferred)">{traffic.arriving.length}</Row>
          <Row label="Departing (inferred)">{traffic.departing.length}</Row>
          <p className="text-xs text-muted-foreground">
            Counted from aircraft this map can currently see, not from schedules.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          Weather: NOAA Aviation Weather Center. Delays: FAA NAS Status. For information only, not
          for flight planning.
        </p>
      </div>
    </aside>
  );
}
