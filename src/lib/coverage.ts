// Browser-safe planner: which ≤250 nm circles cover the current map view.
// Large views use a fixed global lattice so panning reuses circles (stable cache keys).

export const SOURCE_MAX_RADIUS_NM = 250;
export const MAX_CIRCLES = 6;
/** Wide views refetch this many nearest circles every poll. Farther circles alternate. */
export const WIDE_NEAR_CIRCLES = 3;
/** Lattice cell edge in nm. Half the diagonal (≈247 nm) stays under the source maximum. */
const CELL_NM = 350;
/**
 * Smaller fixed lattices for zoomed-in views, so visitors looking at the same area ask for the
 * same tiles (same cache keys) instead of each asking for their own circle.
 * Radius is half the cell diagonal rounded UP to the server's 5 nm step.
 */
export const FINE_CELL_NM = 100;
export const MEDIUM_CELL_NM = 200;
/** View radius limits (nm) for the fine and medium lattices. */
export const FINE_MAX_VIEW_NM = 40;
export const MEDIUM_MAX_VIEW_NM = 90;
/** A single shared circle: centre snapped to this many degrees, radius to this many nm. */
const SNAP_DEG = 0.5;
const SNAP_RADIUS_NM = 25;
/** Largest distance a snapped centre can be from the real centre (half of 0.5 degrees, diagonal). */
const SNAP_SLACK_NM = 22;
const NM_PER_DEG = 60;
const MAX_LAT = 85;

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CoverageView {
  lat: number;
  lon: number;
  radiusNm: number;
  bounds?: Bounds | undefined;
}

export interface Circle {
  key: string;
  lat: number;
  lon: number;
  radiusNm: number;
}

/** fine and medium are fixed lattices; single is one circle; wide is the 350 nm lattice. */
export type CoverageTier = "fine" | "medium" | "single" | "wide";

export interface CoveragePlan {
  circles: Circle[];
  tier: CoverageTier;
  /** True when more than MAX_CIRCLES were needed and only the nearest were kept. */
  partial: boolean;
  totalNeeded: number;
}

const toR = Math.PI / 180;
const normLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function viewRadius(v: CoverageView): number {
  const b = v.bounds;
  if (!b) return v.radiusNm;
  return Math.max(
    haversineNm(v.lat, v.lon, b.north, b.east),
    haversineNm(v.lat, v.lon, b.north, b.west),
    haversineNm(v.lat, v.lon, b.south, b.east),
    haversineNm(v.lat, v.lon, b.south, b.west),
  );
}

function legacySingle(v: CoverageView, r: number): CoveragePlan {
  const lat = Math.round(v.lat * 100) / 100;
  const lon = Math.round(normLon(v.lon) * 100) / 100;
  const radiusNm = Math.max(5, Math.min(SOURCE_MAX_RADIUS_NM, Math.round(r)));
  return {
    circles: [{ key: `${lat},${lon},${radiusNm}`, lat, lon, radiusNm }],
    tier: "single",
    partial: false,
    totalNeeded: 1,
  };
}

/** Circles on a fixed lattice of `cellNm` squares that together cover the view's bounds. */
function latticeCircles(
  v: CoverageView & { bounds: Bounds },
  cellNm: number,
  radiusNm: number,
  tier: CoverageTier,
): CoveragePlan {
  const b = v.bounds;
  const south = Math.max(-MAX_LAT, b.south);
  const north = Math.min(MAX_LAT, b.north);
  const west = Math.max(b.west, b.east - 360);
  const east = b.east;
  const latStep = cellNm / NM_PER_DEG;

  const cells: (Circle & { d: number })[] = [];
  for (let row = Math.floor(south / latStep); row * latStep < north; row++) {
    const lat0 = row * latStep;
    const lat1 = lat0 + latStep;
    // Width is measured at the equator-most edge so the circle covers the whole cell.
    const edge = lat0 <= 0 && lat1 >= 0 ? 0 : Math.min(Math.abs(lat0), Math.abs(lat1));
    const lonStep = Math.min(360, cellNm / (NM_PER_DEG * Math.max(0.05, Math.cos(edge * toR))));
    const cLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, (lat0 + lat1) / 2));
    for (let col = Math.floor((west + 180) / lonStep); col * lonStep - 180 < east; col++) {
      const cLon = normLon(col * lonStep - 180 + lonStep / 2);
      const lat = Math.round(cLat * 100) / 100;
      const lon = Math.round(cLon * 100) / 100;
      const key = `${lat},${lon},${radiusNm}`;
      if (cells.some((c) => c.key === key)) continue;
      cells.push({ key, lat, lon, radiusNm, d: haversineNm(v.lat, v.lon, lat, lon) });
    }
  }
  cells.sort((a, b2) => a.d - b2.d);
  return {
    circles: cells.slice(0, MAX_CIRCLES).map(({ d: _d, ...c }) => c),
    tier,
    partial: cells.length > MAX_CIRCLES,
    totalNeeded: cells.length,
  };
}

const tileRadius = (cellNm: number) => Math.ceil((cellNm * Math.SQRT2) / 2 / 5) * 5;

export function planCoverage(v: CoverageView): CoveragePlan {
  const r = viewRadius(v);
  if (!v.bounds) return legacySingle(v, r);
  const view = { ...v, bounds: v.bounds };

  // Zoomed in: fixed tiles, the same for every visitor looking at the same area.
  if (r <= FINE_MAX_VIEW_NM) {
    return latticeCircles(view, FINE_CELL_NM, tileRadius(FINE_CELL_NM), "fine");
  }
  if (r <= MEDIUM_MAX_VIEW_NM) {
    return latticeCircles(view, MEDIUM_CELL_NM, tileRadius(MEDIUM_CELL_NM), "medium");
  }
  if (r <= SOURCE_MAX_RADIUS_NM) {
    // One circle. Snap the centre and radius so nearby views share a cache entry, as long as
    // the snapped circle still covers the view and stays within the source maximum.
    const radiusNm = Math.ceil((r + SNAP_SLACK_NM) / SNAP_RADIUS_NM) * SNAP_RADIUS_NM;
    if (radiusNm <= SOURCE_MAX_RADIUS_NM) {
      const lat = Math.round(v.lat / SNAP_DEG) * SNAP_DEG;
      const lon = Math.round(normLon(v.lon) / SNAP_DEG) * SNAP_DEG;
      return {
        circles: [{ key: `${lat},${lon},${radiusNm}`, lat, lon, radiusNm }],
        tier: "single",
        partial: false,
        totalNeeded: 1,
      };
    }
    return legacySingle(v, r);
  }

  return latticeCircles(view, CELL_NM, Math.floor((CELL_NM * Math.SQRT2) / 2), "wide");
}

/**
 * Whether a stale circle should be requested on this poll.
 * The nearest circles are always due. Farther circles are due on even polls,
 * and on any poll when they have no cached sample. Callers still serve a
 * skipped circle from its aged cache.
 */
export function wideCircleDue(index: number, hasCache: boolean, pollIndex: number): boolean {
  if (index < WIDE_NEAR_CIRCLES) return true;
  if (!hasCache) return true;
  return pollIndex % 2 === 0;
}
