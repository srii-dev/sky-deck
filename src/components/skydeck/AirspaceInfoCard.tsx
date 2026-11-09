import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KIND_COLORS, KIND_LABELS, limitsText, type Airspace } from "@/lib/airspace";

/* Details for a clicked airspace area (Phase 8d). Not for flight planning. */

export function AirspaceInfoCard({ area, onClose }: { area: Airspace; onClose: () => void }) {
  const limits = limitsText(area);
  return (
    <section
      aria-label="Airspace area"
      className="glass-panel pointer-events-auto w-[min(92vw,360px)] max-w-full rounded-md p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ background: KIND_COLORS[area.kind] }}
            />
            <span className="data-value">{KIND_LABELS[area.kind]}</span>
          </div>
          <div className="mt-0.5 text-sm">{area.name}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Close airspace details"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <dl className="mt-2 space-y-0.5 text-sm">
        {limits && (
          <div className="flex justify-between gap-3">
            <dt className="hud-label">Altitudes</dt>
            <dd className="text-right">{limits}</dd>
          </div>
        )}
        {area.hours && (
          <div className="flex justify-between gap-3">
            <dt className="hud-label">Times of use</dt>
            <dd className="break-words text-right">{area.hours}</dd>
          </div>
        )}
      </dl>
      {area.layer === "special" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Whether this area is active right now is not known from this data.
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Source: FAA open data. Boundaries are simplified. Educational only, not for flight planning.
      </p>
    </section>
  );
}
