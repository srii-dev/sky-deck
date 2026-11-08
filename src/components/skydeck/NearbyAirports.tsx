import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Airport } from "@/lib/airports";
import type { NearbyAirport } from "@/lib/nearby-airports";
import { fmtRange } from "@/lib/glide-ring";
import type { UnitSystem } from "@/lib/units";

/* Airports near the user's location (Phase 4c). Shown only after the user taps My location. */

interface Props {
  items: NearbyAirport[];
  units: UnitSystem;
  onPick: (a: Airport) => void;
  onClose: () => void;
}

export function NearbyAirports({ items, units, onPick, onClose }: Props) {
  return (
    <section
      aria-label="Nearby airports"
      className="glass-panel pointer-events-auto w-60 rounded-md p-2"
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="hud-label">Nearby airports</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="Close nearby airports"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="px-1 pb-1 text-sm text-muted-foreground">
          No airports in the list within 150 nm.
        </p>
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.airport.icao}>
              <button
                className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-1 text-left text-sm hover:bg-accent"
                onClick={() => onPick(n.airport)}
              >
                <span className="truncate">
                  <span className="data-value">{n.airport.iata || n.airport.icao}</span>{" "}
                  {n.airport.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmtRange(n.distanceNm, units)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
