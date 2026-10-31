import { AlertTriangle } from "lucide-react";
import { EMERGENCY_SQUAWKS, type Aircraft } from "@/lib/aircraft";

export function EmergencyBanner({ aircraft, onPick }: { aircraft: Aircraft[]; onPick: (a: Aircraft) => void }) {
  if (!aircraft.length) return null;
  return (
    <div
      role="alert"
      className="glow-danger pointer-events-auto flex max-w-[min(92vw,640px)] items-center gap-3 rounded-md border border-destructive bg-destructive/90 px-3 py-2 text-destructive-foreground backdrop-blur"
    >
      <AlertTriangle className="animate-emergency size-5 shrink-0" />
      <div className="min-w-0">
        <div className="font-display text-xs font-bold uppercase tracking-[0.2em]">
          {aircraft.length === 1 ? "Emergency squawk" : `${aircraft.length} emergency squawks`}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {aircraft.slice(0, 4).map((a) => (
            <button
              key={a.hex}
              onClick={() => onPick(a)}
              className="data-value text-xs text-destructive-foreground underline-offset-2 hover:underline"
            >
              {a.callsign ?? a.registration ?? a.hex.toUpperCase()} · {a.squawk}{" "}
              {EMERGENCY_SQUAWKS[a.squawk ?? ""]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
