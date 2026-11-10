import type { ColorMode } from "@/lib/airline-colors";
import type { UnitSystem } from "@/lib/units";

export function AltitudeLegend({ units, colorBy }: { units: UnitSystem; colorBy?: ColorMode }) {
  if (colorBy === "airline") {
    return (
      <div className="glass-panel w-48 rounded-md px-3 py-2">
        <div className="hud-label mb-1.5">Colour</div>
        <div className="text-xs text-muted-foreground">
          One colour per airline; grey has no airline code. The trail still shows altitude.
        </div>
      </div>
    );
  }
  const marks =
    units === "metric" ? ["0", "3k", "6k", "9k", "12k m"] : ["0", "10k", "20k", "30k", "40k ft"];
  return (
    <div className="glass-panel w-48 rounded-md px-3 py-2">
      <div className="hud-label mb-1.5">Altitude</div>
      <div className="bg-altitude-scale h-1.5 rounded-full" />
      <div className="data-value mt-1 flex justify-between text-[10px] text-muted-foreground">
        {marks.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}
