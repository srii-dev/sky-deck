/*
 * Decides whether the aircraft layer needs a new setData this animation tick.
 *
 * The motion loop computes positions every FRAME_MS (about 11 times a second). Zoomed out, an airliner moves a small
 * fraction of a pixel in that time, yet every setData makes MapLibre re-upload the source and repaint the whole map.
 * On a slow phone those repaints kept the main thread busy for seconds after load (Lighthouse: about 10 s of
 * main-thread time in the map chunk). Redrawing only once something visibly changed gives the same picture for far
 * less work: positions are compared against the last drawn frame, so slow movement still adds up and is drawn.
 */

/** A drawn aircraft as far as the redraw decision is concerned. `look` joins every property that is not compared by size. */
export type DrawnPlane = {
  lon: number;
  lat: number;
  track: number;
  fade: number;
  alt: number;
  look: string;
};

/** Smallest movement, in screen pixels at the map centre's scale, that is drawn. */
export const MIN_MOVE_PX = 1;
/** Smallest icon rotation, in degrees, that is drawn. */
export const MIN_TURN_DEG = 2;
/** Smallest opacity change that is drawn (ghosts fade out over many seconds). */
export const MIN_FADE = 0.02;
/** Altitude only orders overlapping icons, so small changes do not matter. */
export const MIN_ALT_FT = 200;

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const M_PER_DEG = 111320;

/** Ground metres per screen pixel at this latitude and zoom (MapLibre's 512 px world tile). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

function turned(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * True when `next` would look different from `prev` (the frame last drawn): an aircraft appeared or went, changed
 * colour, icon, label, selection or emergency state, or moved, turned, faded or changed altitude by more than the
 * thresholds above. `mpp` is metres per pixel at the current view (see metersPerPixel).
 */
export function needsRedraw(
  prev: ReadonlyMap<string, DrawnPlane> | null,
  next: ReadonlyMap<string, DrawnPlane>,
  mpp: number,
): boolean {
  if (!prev || prev.size !== next.size) return true;
  const minMoveM = MIN_MOVE_PX * mpp;
  const minMoveSq = minMoveM * minMoveM;
  for (const [hex, n] of next) {
    const p = prev.get(hex);
    if (!p || p.look !== n.look) return true;
    if (Math.abs(p.fade - n.fade) >= MIN_FADE) return true;
    if (Math.abs(p.alt - n.alt) >= MIN_ALT_FT) return true;
    if (turned(p.track, n.track) >= MIN_TURN_DEG) return true;
    const dy = (n.lat - p.lat) * M_PER_DEG;
    const dx = (n.lon - p.lon) * M_PER_DEG * Math.cos((n.lat * Math.PI) / 180);
    if (dx * dx + dy * dy >= minMoveSq) return true;
  }
  return false;
}
