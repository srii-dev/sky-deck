export type UnitSystem = "aviation" | "metric" | "imperial";

export const UNIT_LABELS: Record<UnitSystem, string> = {
  aviation: "Aviation",
  metric: "Metric",
  imperial: "Imperial",
};

const FT_TO_M = 0.3048;
const KT_TO_KMH = 1.852;
const KT_TO_MPH = 1.150779;

export function fmtAltitude(ft: number | null, u: UnitSystem): string {
  if (ft == null) return "—";
  if (u === "metric") return `${Math.round(ft * FT_TO_M).toLocaleString("en-US")} m`;
  return `${Math.round(ft).toLocaleString("en-US")} ft`;
}

export function fmtSpeed(kt: number | null, u: UnitSystem): string {
  if (kt == null) return "—";
  if (u === "metric") return `${Math.round(kt * KT_TO_KMH)} km/h`;
  if (u === "imperial") return `${Math.round(kt * KT_TO_MPH)} mph`;
  return `${Math.round(kt)} kt`;
}

export function fmtVerticalRate(fpm: number | null, u: UnitSystem): string {
  if (fpm == null) return "—";
  const sign = fpm > 0 ? "+" : "";
  if (u === "metric") return `${sign}${((fpm * FT_TO_M) / 60).toFixed(1)} m/s`;
  return `${sign}${Math.round(fpm).toLocaleString("en-US")} ft/min`;
}

export function fmtHeading(deg: number | null): string {
  if (deg == null) return "—";
  return `${String(Math.round(deg) % 360).padStart(3, "0")}°`;
}

export function compassPoint(deg: number | null): string {
  if (deg == null) return "";
  const pts = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return pts[Math.round((((deg % 360) + 360) % 360) / 45) % 8] ?? "";
}
