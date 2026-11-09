import { useMemo } from "react";

import { useTerrainProfile } from "@/hooks/use-terrain-profile";
import type { Aircraft, FlightRoute } from "@/lib/aircraft";
import { fmtRange } from "@/lib/glide-ring";
import { isDrawableRoute, routeProgress } from "@/lib/route-geometry";
import {
  altitudeY,
  chartTopFt,
  PROFILE_DISCLAIMER,
  profileAreaPath,
  summarizeProfile,
} from "@/lib/terrain-profile";
import { fmtAltitude, type UnitSystem } from "@/lib/units";

/*
 * Terrain along the route line (Phase 8b): a small profile chart with the aircraft's position and altitude. The
 * line is the straight (great-circle) line between the two airports, so this is an overview of the terrain on
 * the way and not the flight's real path.
 */

const W = 300;
const H = 80;

export function RouteTerrain({
  route,
  aircraft,
  units,
}: {
  route: FlightRoute | null | undefined;
  aircraft: Aircraft;
  units: UnitSystem;
}) {
  const origin = route?.origin ?? null;
  const destination = route?.destination ?? null;
  const drawable = isDrawableRoute(origin, destination);
  const profile = useTerrainProfile(origin, destination, drawable);

  const view = useMemo(() => {
    const data = profile.data;
    if (!data || !origin || !destination) return null;
    const summary = summarizeProfile(data.points);
    if (!summary) return null;
    const progress = routeProgress(origin, destination, aircraft);
    const alt = aircraft.onGround ? 0 : aircraft.altFt;
    const top = chartTopFt(summary.maxFt, alt);
    return {
      summary,
      progress,
      top,
      path: profileAreaPath(data.points, W, H, top),
      altY: alt == null ? null : altitudeY(alt, H, top),
      x: progress.fraction * W,
    };
  }, [profile.data, origin, destination, aircraft]);

  if (!drawable) return null;

  return (
    <section aria-label="Terrain along the route" className="space-y-1.5">
      <div className="hud-label">Terrain along the route</div>
      {profile.isPending && <p className="text-sm text-muted-foreground">Loading terrain…</p>}
      {profile.isError && (
        <p className="text-sm text-muted-foreground">Terrain is not available right now.</p>
      )}
      {profile.data && !view && (
        <p className="text-sm text-muted-foreground">
          No terrain data could be read for this route.
        </p>
      )}
      {view && (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-24 w-full"
            role="img"
            aria-label={"Terrain profile, highest point " + fmtAltitude(view.summary.maxFt, units)}
            preserveAspectRatio="none"
          >
            <path d={view.path} fill="currentColor" className="text-muted-foreground/40" />
            <line
              x1={view.x}
              x2={view.x}
              y1={0}
              y2={H}
              stroke="currentColor"
              strokeDasharray="3 3"
              className="text-primary/60"
            />
            {view.altY != null && (
              <circle cx={view.x} cy={view.altY} r={4} className="fill-primary" />
            )}
          </svg>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{origin?.iata ?? origin?.icao ?? "Origin"}</span>
            <span>0 to {fmtAltitude(view.top, units)}</span>
            <span>{destination?.iata ?? destination?.icao ?? "Destination"}</span>
          </div>
          <p className="text-sm">
            Highest terrain about <strong>{fmtAltitude(view.summary.maxFt, units)}</strong>,{" "}
            {fmtRange(view.summary.maxAtNm, units)} from the start. About{" "}
            {fmtRange(view.progress.remainingNm, units)} left on the straight line.
          </p>
          {view.progress.offLineNm > 60 && (
            <p className="text-xs text-muted-foreground">
              This aircraft is {fmtRange(view.progress.offLineNm, units)} from the straight line, so
              it is probably not flying this exact path.
            </p>
          )}
          <p className="text-xs text-muted-foreground">{PROFILE_DISCLAIMER}</p>
        </>
      )}
    </section>
  );
}
