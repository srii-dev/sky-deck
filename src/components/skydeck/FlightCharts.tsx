import { useMemo } from "react";

import { buildSeries, formatSpan, seriesPath, type Series } from "@/lib/chart-series";
import { fmtAltitude, fmtSpeed, fmtVerticalRate, type UnitSystem } from "@/lib/units";
import type { TrailPoint } from "./map-config";

interface Props {
  trail: TrailPoint[];
  units: UnitSystem;
}

const W = 240;
const H = 44;

function Chart({
  label,
  series,
  fmt,
  color,
}: {
  label: string;
  series: Series | null;
  fmt: (v: number) => string;
  color: string;
}) {
  const last = series?.points[series.points.length - 1];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="hud-label">{label}</span>
        {series && last && (
          <span className="data-value text-[11px] text-muted-foreground">
            {fmt(series.min)} to {fmt(series.max)}
          </span>
        )}
      </div>
      {series ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-1 h-11 w-full"
          role="img"
          aria-label={`${label} over the last ${formatSpan(series.spanMs)}`}
          preserveAspectRatio="none"
        >
          <path d={seriesPath(series, W, H)} fill="none" stroke={color} strokeWidth={1.6} />
        </svg>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">Not enough data yet</p>
      )}
    </div>
  );
}

/** Altitude, speed and vertical rate since the page started watching this aircraft. */
export function FlightCharts({ trail, units }: Props) {
  const { alt, gs, vr, span } = useMemo(() => {
    const t0 = (p: TrailPoint) => p.t;
    const alt = buildSeries(trail.map((p) => ({ t: t0(p), value: p.altFt })));
    const gs = buildSeries(trail.map((p) => ({ t: t0(p), value: p.gs })));
    const vr = buildSeries(trail.map((p) => ({ t: t0(p), value: p.vRate })));
    return { alt, gs, vr, span: alt?.spanMs ?? gs?.spanMs ?? vr?.spanMs ?? 0 };
  }, [trail]);

  return (
    <div className="space-y-3 rounded-md border border-border/50 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="hud-label">Flight chart</span>
        <span className="data-value text-[11px] text-muted-foreground">
          {span > 0 ? `last ${formatSpan(span)}` : "since you started watching"}
        </span>
      </div>
      <Chart
        label="Altitude"
        series={alt}
        fmt={(v) => fmtAltitude(v, units)}
        color="var(--primary)"
      />
      <Chart
        label="Ground speed"
        series={gs}
        fmt={(v) => fmtSpeed(v, units)}
        color="var(--success)"
      />
      <Chart
        label="Vertical rate"
        series={vr}
        fmt={(v) => fmtVerticalRate(v, units)}
        color="var(--warning)"
      />
      <p className="text-[10px] text-muted-foreground">
        Built from the positions this browser has seen; it starts empty when you open the page.
      </p>
    </div>
  );
}
