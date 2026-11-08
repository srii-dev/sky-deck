import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  altitudeText,
  hazardColor,
  SEVERITY_COLORS,
  type Advisory,
  type Pirep,
} from "@/lib/weather-advisories";

/* Details for a clicked advisory polygon or pilot report (Phase 7e). The text is the raw bulletin. */

export type WeatherItem = { kind: "advisory"; item: Advisory } | { kind: "pirep"; item: Pirep };

function timeText(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toISOString().slice(5, 16).replace("T", " ") + " UTC";
}

const KIND_NAMES: Record<Advisory["kind"], string> = {
  sigmet: "US SIGMET",
  isigmet: "International SIGMET",
  gairmet: "G-AIRMET",
};

export function WeatherInfoCard({ entry, onClose }: { entry: WeatherItem; onClose: () => void }) {
  const close = (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label="Close weather details"
      onClick={onClose}
    >
      <X className="size-4" />
    </Button>
  );
  if (entry.kind === "advisory") {
    const a = entry.item;
    const top = altitudeText(a.topFt);
    const base = altitudeText(a.baseFt);
    return (
      <section
        aria-label="Weather advisory"
        className="glass-panel pointer-events-auto w-[min(92vw,360px)] rounded-md p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block size-3 rounded-sm"
                style={{ background: hazardColor(a.hazard) }}
              />
              <span className="data-value">{a.label}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{KIND_NAMES[a.kind]}</div>
          </div>
          {close}
        </div>
        <dl className="mt-2 space-y-0.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="hud-label">Valid</dt>
            <dd>
              {timeText(a.validFrom)} to {timeText(a.validTo)}
            </dd>
          </div>
          {(base || top) && (
            <div className="flex justify-between gap-3">
              <dt className="hud-label">Altitude</dt>
              <dd>
                {base ?? "surface"} to {top ?? "—"}
              </dd>
            </div>
          )}
        </dl>
        {a.text && (
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/40 p-2 font-mono text-xs">
            {a.text}
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Source: NOAA Aviation Weather Center. Not for flight planning.
        </p>
      </section>
    );
  }
  const p = entry.item;
  return (
    <section
      aria-label="Pilot report"
      className="glass-panel pointer-events-auto w-[min(92vw,360px)] rounded-md p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-full"
            style={{ background: SEVERITY_COLORS[p.severity] }}
          />
          <span className="data-value">Pilot report</span>
          {p.aircraft && <Badge variant="outline">{p.aircraft}</Badge>}
        </div>
        {close}
      </div>
      <dl className="mt-2 space-y-0.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="hud-label">Reported</dt>
          <dd>{timeText(p.obsAt)}</dd>
        </div>
        {p.flightLevel != null && (
          <div className="flex justify-between gap-3">
            <dt className="hud-label">Level</dt>
            <dd>FL{String(p.flightLevel).padStart(3, "0")}</dd>
          </div>
        )}
        {p.turbulence && (
          <div className="flex justify-between gap-3">
            <dt className="hud-label">Turbulence</dt>
            <dd>{p.turbulence}</dd>
          </div>
        )}
        {p.icing && (
          <div className="flex justify-between gap-3">
            <dt className="hud-label">Icing</dt>
            <dd>{p.icing}</dd>
          </div>
        )}
      </dl>
      <p className="mt-2 max-h-32 overflow-y-auto break-words rounded-md bg-background/40 p-2 font-mono text-xs">
        {p.raw}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Source: NOAA Aviation Weather Center. Not for flight planning.
      </p>
    </section>
  );
}
