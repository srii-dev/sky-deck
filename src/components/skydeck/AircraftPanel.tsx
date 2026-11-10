import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, Crosshair, Plane, Star, Video, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getFlightRoute } from "@/lib/adsb.functions";
import {
  airlineCode,
  altitudeColor,
  EMERGENCY_SQUAWKS,
  flightStatus,
  isEmergency,
  type Aircraft,
} from "@/lib/aircraft";
import { airlineName } from "@/lib/airlines";
import { aircraftDetailFields } from "@/lib/aircraft-details";
import { sheetGesture } from "@/lib/sheet-gesture";
import {
  compassPoint,
  fmtAltitude,
  fmtHeading,
  fmtSpeed,
  fmtVerticalRate,
  type UnitSystem,
} from "@/lib/units";
import { GLIDE_DISCLAIMER, GLIDE_RATIO_LABEL, fmtRange, glideRatioBounds } from "@/lib/glide-ring";
import { currentAirportList, isLargeLoaded, loadLargeAirports } from "@/lib/airport-list";
import {
  formatNearestReachable,
  REACHABLE_LIMIT,
  reachableAirports,
  reachableListNote,
} from "@/lib/reachable-airports";
import type { GlideStatus } from "./FlightMap";
import { FlightCharts } from "./FlightCharts";
import { RouteTerrain } from "./RouteTerrain";
import type { TrailPoint } from "./map-config";
import { AcarsMessages } from "./AcarsMessages";
import { FlightFacts } from "./FlightFacts";
import { TrailExport } from "./TrailExport";
import { cn } from "@/lib/utils";

interface Props {
  aircraft: Aircraft;
  units: UnitSystem;
  trail: TrailPoint[];
  trail3d: boolean;
  onTrail3d: (v: boolean) => void;
  follow: boolean;
  onFollow: (v: boolean) => void;
  /** Chase camera: while following, look along the aircraft's heading from behind (Phase 5d). */
  chase: boolean;
  onChase: (v: boolean) => void;
  /** Watch buttons (Phase 5a). The flight button only exists when the aircraft has a callsign. */
  watchControls?: {
    aircraftOn: boolean;
    flightOn: boolean | null;
    flightLabel: string | null;
    onToggleAircraft: () => void;
    onToggleFlight: () => void;
  };
  glideRing: boolean;
  onGlideRing: (v: boolean) => void;
  glideRatio: number | null;
  onGlideRatio: (v: number) => void;
  glideStatus?: GlideStatus | undefined;
  /** Provider that supplied the positions (for the credit line in exported files). */
  source?: string | null | undefined;
  onClose: () => void;
}

const STATUS_LABEL = {
  ground: "On ground",
  climbing: "Climbing",
  descending: "Descending",
  cruising: "Cruising",
};

function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border/60 bg-background/40 px-3 py-2", className)}>
      <div className="hud-label mb-1">{label}</div>
      <div className="data-value truncate text-sm">{children}</div>
    </div>
  );
}

export function AircraftPanel(props: Props) {
  const { aircraft: a } = props;
  const [expanded, setExpanded] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const swiped = useRef(false);
  const status = flightStatus(a);
  const emg = isEmergency(a.squawk);
  const code = airlineCode(a.callsign);
  const operator = a.operator ?? airlineName(code);
  const bounds = glideRatioBounds(a.kind);
  const currentRatio = props.glideRatio ?? bounds?.defaultRatio ?? 12;
  const glideRangeNm =
    props.glideRing && props.glideStatus?.elevationAvailable ? props.glideStatus.rangeNm : null;
  // The larger airport list is loaded the first time a glide range is available.
  const wantsAirports = glideRangeNm != null;
  const [listVersion, setListVersion] = useState(0);
  useEffect(() => {
    if (!wantsAirports || isLargeLoaded()) return;
    let live = true;
    loadLargeAirports()
      .then(() => {
        if (live) setListVersion((v) => v + 1);
      })
      .catch(() => {
        // Keep showing the short built-in list.
      });
    return () => {
      live = false;
    };
  }, [wantsAirports]);
  const reachable = useMemo(
    () => reachableAirports(a.lat, a.lon, glideRangeNm, REACHABLE_LIMIT, currentAirportList()),
    // listVersion changes when the larger list finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a.lat, a.lon, glideRangeNm, listVersion],
  );

  const route = useQuery({
    queryKey: ["route", a.callsign],
    queryFn: () => getFlightRoute({ data: { callsign: a.callsign! } }),
    enabled: !!a.callsign && a.callsign.length >= 3,
    staleTime: 30 * 60 * 1000,
  });

  const nearestLabel = formatNearestReachable(reachable, props.units);

  const header = (isMobile: boolean) => (
    <div className="flex items-start gap-3">
      <div
        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background/60"
        style={{ color: emg ? undefined : altitudeColor(a.altFt, a.onGround) }}
      >
        <Plane
          className={cn("size-5", emg && "text-destructive")}
          style={{ transform: `rotate(${(a.track ?? 45) - 45}deg)` }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-bold leading-none tracking-wide text-foreground">
            {a.callsign ?? a.registration ?? a.hex.toUpperCase()}
          </h2>
          {emg ? (
            <Badge variant="emergency">
              {a.squawk} · {EMERGENCY_SQUAWKS[a.squawk!]}
            </Badge>
          ) : (
            <Badge variant={status}>{STATUS_LABEL[status]}</Badge>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {[operator, a.description ?? a.type].filter(Boolean).join(" · ") || "Unknown operator"}
        </p>
        {nearestLabel && (
          <p className="mt-0.5 truncate text-xs font-medium text-primary/90">{nearestLabel}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isMobile && (
          <Button
            variant="hud"
            size="icon"
            className="size-10"
            aria-label={expanded ? "Collapse details" : "Expand details"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown /> : <ChevronUp />}
          </Button>
        )}
        <Button
          variant="hud"
          size="icon"
          className="size-10"
          aria-label="Close"
          onClick={props.onClose}
        >
          <X />
        </Button>
      </div>
    </div>
  );

  const r = route.data;
  const body = (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-background/40 px-3 py-3">
        <div className="hud-label mb-2">Route</div>
        {r ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="data-value text-xl font-semibold text-primary">
                {r.origin.iata ?? r.origin.icao}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.origin.location ?? r.origin.name}
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-right">
              <div className="data-value text-xl font-semibold text-primary">
                {r.destination.iata ?? r.destination.icao}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.destination.location ?? r.destination.name}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {route.isLoading ? "Looking up route…" : "Route not available"}
          </div>
        )}
      </div>

      <FlightFacts aircraft={a} route={r} units={props.units} />

      <div className="grid grid-cols-2 gap-2">
        <Cell label="Altitude">{a.onGround ? "Ground" : fmtAltitude(a.altFt, props.units)}</Cell>
        <Cell label="Ground speed">{fmtSpeed(a.gs, props.units)}</Cell>
        <Cell label="Vertical rate">
          <span
            className={cn(
              (a.vRate ?? 0) > 300 && "text-success",
              (a.vRate ?? 0) < -300 && "text-primary",
            )}
          >
            {fmtVerticalRate(a.vRate, props.units)}
          </span>
        </Cell>
        <Cell label="Heading">
          {fmtHeading(a.track)}{" "}
          <span className="text-muted-foreground">{compassPoint(a.track)}</span>
        </Cell>
        <Cell label="Squawk" className={cn(emg && "border-destructive bg-destructive/15")}>
          <span className={cn(emg && "text-destructive")}>
            {a.reportedSquawk ?? a.squawk ?? "—"}
          </span>
        </Cell>
        <Cell label="ICAO hex">{a.hex.toUpperCase()}</Cell>
        <Cell label="Registration">{a.registration ?? "—"}</Cell>
        <Cell label="Type">{a.type ?? "—"}</Cell>
        <Cell label="Category">{a.kindLabel}</Cell>
        <Cell label="Position age">{`${Math.round(a.seenPos)}s`}</Cell>
      </div>

      <div className="rounded-md border border-border/60 bg-background/40 px-3 py-3">
        <div className="hud-label mb-2">About this aircraft</div>
        <dl className="space-y-1.5 text-sm">
          {aircraftDetailFields(a, new Date()).map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-xs text-muted-foreground">{f.label}</dt>
              <dd
                className={cn(
                  "min-w-0 text-right",
                  f.known ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {f.value}
                {f.note && (
                  <span className="block text-[11px] text-muted-foreground">{f.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          From the live feed&apos;s aircraft database. Many aircraft have no entry, so Unknown is
          common.
        </p>
      </div>

      <FlightCharts trail={props.trail} units={props.units} />
      <RouteTerrain route={r} aircraft={a} units={props.units} />
      <TrailExport aircraft={a} trail={props.trail} source={props.source} />
      <AcarsMessages hex={a.hex} />

      <div className="space-y-3 rounded-md border border-border/60 bg-background/40 px-3 py-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="trail3d" className="text-sm">
            3D trail at real altitude
          </Label>
          <Switch id="trail3d" checked={props.trail3d} onCheckedChange={props.onTrail3d} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="follow" className="flex items-center gap-2 text-sm">
            <Crosshair className="size-4 text-muted-foreground" /> Follow aircraft
          </Label>
          <Switch id="follow" checked={props.follow} onCheckedChange={props.onFollow} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="chase" className="flex items-center gap-2 text-sm">
            <Video className="size-4 text-muted-foreground" /> Chase camera
            <span className="text-[11px] text-muted-foreground">(needs Follow)</span>
          </Label>
          <Switch
            id="chase"
            checked={props.chase}
            disabled={!props.follow}
            onCheckedChange={props.onChase}
          />
        </div>
        {props.watchControls && (
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-2">
            <Button
              variant={props.watchControls.aircraftOn ? "default" : "outline"}
              size="sm"
              aria-pressed={props.watchControls.aircraftOn}
              onClick={props.watchControls.onToggleAircraft}
            >
              <Star />{" "}
              {props.watchControls.aircraftOn ? "Watching this aircraft" : "Watch this aircraft"}
            </Button>
            {props.watchControls.flightOn !== null && (
              <Button
                variant={props.watchControls.flightOn ? "default" : "outline"}
                size="sm"
                aria-pressed={props.watchControls.flightOn}
                onClick={props.watchControls.onToggleFlight}
              >
                <Star /> {props.watchControls.flightOn ? "Watching flight " : "Watch flight "}
                {props.watchControls.flightLabel}
              </Button>
            )}
          </div>
        )}
        {bounds == null ? (
          <div className="border-t border-border/40 pt-2 text-xs text-muted-foreground">
            No glide ring for this category
          </div>
        ) : (
          <div className="space-y-2 border-t border-border/40 pt-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="glide-ring" className="text-sm">
                Glide range ring
              </Label>
              <Switch
                id="glide-ring"
                checked={props.glideRing}
                onCheckedChange={props.onGlideRing}
              />
            </div>
            {props.glideRing && (
              <div className="space-y-2 rounded bg-background/50 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Ratio: <span className="font-semibold text-foreground">{currentRatio}:1</span>
                    {a.kind === "generic" && (
                      <span className="ml-1 text-[10px] text-muted-foreground/80">
                        (Unknown category)
                      </span>
                    )}
                  </span>
                  {props.glideStatus?.elevationAvailable && props.glideStatus.rangeNm != null && (
                    <span className="font-semibold text-primary">
                      {fmtRange(props.glideStatus.rangeNm, props.units)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{bounds.min}</span>
                  <input
                    type="range"
                    min={bounds.min}
                    max={bounds.max}
                    step={bounds.step}
                    value={currentRatio}
                    onChange={(e) => props.onGlideRatio(parseFloat(e.target.value))}
                    aria-label="Glide ratio"
                    aria-valuetext={`${currentRatio} to 1`}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-secondary accent-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">{bounds.max}</span>
                </div>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {GLIDE_RATIO_LABEL}
                </p>
                {!props.glideStatus?.elevationAvailable && props.glideStatus?.reason && (
                  <p className="text-[11px] font-medium leading-tight text-destructive">
                    {props.glideStatus.reason}
                  </p>
                )}
                {glideRangeNm != null && (
                  <div className="space-y-1 border-t border-border/40 pt-2">
                    <div className="hud-label">Airports within range</div>
                    {reachable.length > 0 ? (
                      <ul className="space-y-0.5">
                        {reachable.map((r) => (
                          <li
                            key={r.airport.icao}
                            className="flex items-baseline justify-between gap-2 text-xs"
                          >
                            <span className="min-w-0 truncate">
                              <span className="font-semibold text-foreground">
                                {r.airport.iata}
                              </span>{" "}
                              <span className="text-muted-foreground">{r.airport.city}</span>
                            </span>
                            <span className="data-value shrink-0 text-muted-foreground">
                              {fmtRange(r.distNm, props.units)} {compassPoint(r.bearingDeg)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        No listed airports within range
                      </p>
                    )}
                    <p className="text-[10px] leading-tight text-muted-foreground/80">
                      {reachableListNote(isLargeLoaded())}
                    </p>
                  </div>
                )}
                <p className="text-[10px] leading-tight text-warning/90">{GLIDE_DISCLAIMER}</p>
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] leading-snug text-muted-foreground">
          The trail builds up from live positions while you watch.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <section
        aria-label="Aircraft details"
        className="glass-panel pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-xl pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ maxHeight: "min(70vh, calc(100dvh - var(--hud-h, 76px) - 8px))" }}
      >
        {/* The handle is a 40 px tall touch target; a swipe up or down opens or closes the details. */}
        <button
          type="button"
          aria-label="Toggle details"
          aria-expanded={expanded}
          onPointerDown={(e) => {
            dragStartY.current = e.clientY;
          }}
          onPointerUp={(e) => {
            const g =
              dragStartY.current == null ? "tap" : sheetGesture(dragStartY.current, e.clientY);
            dragStartY.current = null;
            if (g === "tap") return; // the click handler toggles
            swiped.current = true;
            setExpanded(g === "expand");
          }}
          onClick={() => {
            if (swiped.current) {
              swiped.current = false;
              return;
            }
            setExpanded((v) => !v);
          }}
          className="mx-auto flex h-10 w-full touch-none items-center justify-center"
        >
          <span className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
        </button>
        <div className="px-4 pb-3 pt-3">{header(true)}</div>
        {!expanded && (
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            <Cell label="Alt">{a.onGround ? "GND" : fmtAltitude(a.altFt, props.units)}</Cell>
            <Cell label="Speed">{fmtSpeed(a.gs, props.units)}</Cell>
            <Cell label="Route">
              {r
                ? `${r.origin.iata ?? r.origin.icao}–${r.destination.iata ?? r.destination.icao}`
                : "—"}
            </Cell>
          </div>
        )}
        {expanded && <div className="overflow-y-auto px-4 pb-5">{body}</div>}
      </section>
      <aside
        aria-label="Aircraft details"
        className="glass-panel scanline pointer-events-auto absolute bottom-4 right-14 z-30 hidden w-[360px] flex-col overflow-hidden rounded-lg md:flex"
        style={{ top: "calc(var(--hud-h, 76px) + 8px)" }}
      >
        <div className="border-b border-border/60 p-4">{header(false)}</div>
        <div className="flex-1 overflow-y-auto p-4">{body}</div>
      </aside>
    </>
  );
}
