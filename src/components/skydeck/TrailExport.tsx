import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/download";
import {
  exportablePoints,
  trailFilename,
  trailToCsv,
  trailToGpx,
  trailToKml,
  type TrailExportMeta,
} from "@/lib/trail-export";
import type { Aircraft } from "@/lib/aircraft";
import type { TrailPoint } from "./map-config";

interface Props {
  aircraft: Aircraft;
  trail: TrailPoint[];
  /** The provider that supplied the latest positions. */
  source?: string | null | undefined;
}

/** Download the positions this browser has collected for the selected aircraft. */
export function TrailExport({ aircraft, trail, source }: Props) {
  const count = exportablePoints(trail).length;
  const ready = count >= 2;

  const save = (kind: "csv" | "gpx" | "kml") => {
    const meta: TrailExportMeta = {
      callsign: aircraft.callsign,
      registration: aircraft.registration,
      hex: aircraft.hex,
      source,
      exportedAt: new Date(),
    };
    const ok =
      kind === "csv"
        ? downloadText(
            trailFilename(meta, "csv"),
            "text/csv;charset=utf-8",
            trailToCsv(trail, meta),
          )
        : kind === "gpx"
          ? downloadText(
              trailFilename(meta, "gpx"),
              "application/gpx+xml;charset=utf-8",
              trailToGpx(trail, meta),
            )
          : downloadText(
              trailFilename(meta, "kml"),
              "application/vnd.google-earth.kml+xml;charset=utf-8",
              trailToKml(trail, meta),
            );
    toast(
      ok ? `Saved ${count} positions as ${kind.toUpperCase()}` : "Download is not available here",
    );
  };

  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-3">
      <div className="hud-label mb-2">Download trail</div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 flex-1"
          disabled={!ready}
          onClick={() => save("csv")}
        >
          <Download /> CSV
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 flex-1"
          disabled={!ready}
          onClick={() => save("gpx")}
        >
          <Download /> GPX
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 flex-1"
          disabled={!ready}
          onClick={() => save("kml")}
        >
          <Download /> KML
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {ready
          ? `${count} positions seen since this page opened. The file is built in your browser and carries the data credit.`
          : "Needs at least two positions. Keep the aircraft selected for a little while."}
      </p>
    </div>
  );
}
