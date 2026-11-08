/*
 * Small line charts for the selected aircraft (Phase 22f): altitude, speed and vertical rate built
 * from the positions the browser has seen since the page opened. Pure functions; the SVG is drawn
 * by FlightCharts.tsx.
 */

export interface Sample {
  /** Time in ms. */
  t: number;
  value: number | null | undefined;
}

export interface Series {
  points: { t: number; v: number }[];
  min: number;
  max: number;
  spanMs: number;
}

/** Keep the samples that have a number, in time order, and thin them to at most `maxPoints`. */
export function buildSeries(samples: Sample[], maxPoints = 120): Series | null {
  const clean = samples
    .filter(
      (s): s is { t: number; value: number } =>
        typeof s.value === "number" && Number.isFinite(s.value),
    )
    .sort((a, b) => a.t - b.t);
  if (clean.length < 2) return null;
  let picked = clean;
  if (clean.length > maxPoints) {
    const step = (clean.length - 1) / (maxPoints - 1);
    picked = Array.from({ length: maxPoints }, (_, i) => clean[Math.round(i * step)]!);
  }
  const points = picked.map((s) => ({ t: s.t, v: s.value }));
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const spanMs = last.t - first.t;
  if (spanMs <= 0) return null;
  return { points, min, max, spanMs };
}

/** An SVG path for the series inside a width by height box. A flat series is drawn mid-height. */
export function seriesPath(series: Series, width: number, height: number, pad = 2): string {
  const first = series.points[0]!;
  const range = series.max - series.min;
  const x = (t: number) => pad + ((t - first.t) / series.spanMs) * (width - 2 * pad);
  const y = (v: number) =>
    range === 0 ? height / 2 : height - pad - ((v - series.min) / range) * (height - 2 * pad);
  return series.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");
}

/** "3 min", "45 s" or "1 h 5 min" for a span in ms. */
export function formatSpan(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
