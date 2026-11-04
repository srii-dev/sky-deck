import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, Crosshair, Plane, X } from "lucide-react";

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
import {
  compassPoint,
  fmtAltitude,
  fmtHeading,
  fmtSpeed,
  fmtVerticalRate,
  type UnitSystem,
} from "@/lib/units";
import { GLIDE_DISCLAIMER, GLIDE_RATIO_LABEL, fmtRange, glideRatioBounds } from "@/lib/glide-ring";
import type { GlideStatus } from "./FlightMap";
import { cn } from "@/lib/utils";

interface Props {
  aircraft: Aircraft;
  units: UnitSystem;
  trail3d: boolean;
  onTrail3d: (v: boolean) => void;
  follow: boolean;
  onFollow: (v: boolean) => void;
  glideRing: boolean;
  onGlideRing: (v: boolean) => void;
  glideRatio: number | null;
  onGlideRatio: (v: number) => void;
  glideStatus?: GlideStatus | undefined;
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
  const status = flightStatus(a);
  const emg = isEmergency(a.squawk);
  const code = airlineCode(a.callsign);
  const operator = a.operator ?? airlineName(code);
  const bounds = glideRatioBounds(a.kind);
  const currentRatio = props.glideRatio ?? bounds?.defaultRatio ?? 12;

  const route = useQuery({
    queryKey: ["route", a.callsign],
    queryFn: () => getFlightRoute({ data: { callsign: a.callsign! } }),
    enabled: !!a.callsign && a.callsign.length >= 3,
    staleTime: 30 * 60 * 1000,
  });

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
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isMobile && (
          <Button
            variant="hud"
            size="icon"
            aria-label={expanded ? "Collapse details" : "Expand details"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown /> : <ChevronUp />}
          </Button>
        )}
        <Button variant="hud" size="icon" aria-label="Close" onClick={props.onClose}>
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
        {bounds != null && (
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
        <button
          aria-label="Toggle details"
          onClick={() => setExpanded((v) => !v)}
          className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted-foreground/40"
        />
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
