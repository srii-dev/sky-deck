import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { KIND_LABELS } from "@/lib/aircraft-kind";
import { ICON_SVG, LEGEND_KINDS } from "./aircraft-icons";

export function AircraftTypesLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-panel pointer-events-auto w-48 rounded-md px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="hud-label">Aircraft types</span>
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="size-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {LEGEND_KINDS.map((k) => (
            <li key={k} className="flex items-center gap-2 text-xs text-foreground">
              <svg
                viewBox="0 0 64 64"
                className="size-4 shrink-0 fill-current text-muted-foreground"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: ICON_SVG[k] }}
              />
              {KIND_LABELS[k]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
