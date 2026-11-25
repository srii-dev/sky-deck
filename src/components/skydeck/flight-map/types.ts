import type { RefObject } from "react";
import type { Map as MLMap } from "maplibre-gl";

import type { Aircraft } from "@/lib/aircraft";
import type { ElevationCacheEntry } from "@/lib/glide-ring";
import type { UnitSystem } from "@/lib/units";
import type { ColorMode } from "@/lib/airline-colors";
import type { ReplaySource } from "@/lib/replay";
import type { DelayState, MotionSample, MotionState } from "@/lib/smooth-motion";
import type { AlertAreaDrawing } from "../alert-area-layers";
import type { WeatherMapState } from "../weather-layers";
import type { RouteAirspaceState } from "../route-airspace-layers";
import type { Basemap, FlyTarget, TrailPoint, Viewport } from "../map-config";

export interface GlideStatus {
  aglFt: number | null;
  rangeNm: number | null;
  elevationAvailable: boolean;
  reason?: string;
}

export interface FlightMapProps {
  aircraft: Aircraft[];
  selectedHex: string | null;
  onSelect: (hex: string | null) => void;
  trail: TrailPoint[];
  trail3d: boolean;
  basemap: Basemap;
  terrain: boolean;
  follow: boolean;
  flyTarget: FlyTarget | null;
  onViewportChange: (v: Viewport) => void;
  glideRing?: boolean | undefined;
  glideRatio?: number | null | undefined;
  onGlideStatus?: ((status: GlideStatus) => void) | undefined;
  /** Draw the selected aircraft's trail (default on). */
  showTrail?: boolean | undefined;
  /** Ruler: while active, a map click adds a point instead of selecting an aircraft. */
  rulerActive?: boolean | undefined;
  rulerPoints?: [number, number][] | undefined;
  onRulerPoint?: ((point: [number, number]) => void) | undefined;
  /** Units for the live ruler label that follows the cursor after the first point. */
  rulerUnits?: UnitSystem | undefined;
  /** When the aircraft data arrived (ms, Date.now()). Sample times are measured from it. */
  receivedAt?: number | null | undefined;
  /** Every aircraft in the data, before filters. One missing from here (not just filtered out) fades out. */
  presentHexes?: ReadonlySet<string> | undefined;
  /** Smooth (about 10 s behind, no guessing) or Live (shorter delay, more guessing). Default smooth. */
  smoothMotion?: boolean | undefined;
  /** The delay in use, in whole seconds, when it changes. */
  onMotionDelay?: ((seconds: number) => void) | undefined;
  /** The selected aircraft at the drawn moment, about once a second, so the panel can match the icon. */
  onSelectedMotion?: ((hex: string, m: MotionState) => void) | undefined;
  /** Chase camera (Phase 5d): while following, tilt the map and turn it to look along the aircraft's heading. */
  chase?: boolean | undefined;
  /** Session replay (Phase 9a): draw this recording at its clock time instead of the live aircraft. */
  replay?: ReplaySource | null | undefined;
  /** Shade the night side of the earth (Phase 24d). */
  nightShade?: boolean | undefined;
  /** Colour aircraft by altitude (default) or by airline (Phase 24b). */
  colorBy?: ColorMode | undefined;
  /** Areas used by alert rules, and the one being drawn (Phase 10c). */
  alertAreas?: readonly AlertAreaDrawing[] | undefined;
  /** Area drawing: while on, a map click is reported to onPick instead of selecting something. */
  pickMode?: boolean | undefined;
  onPick?: ((point: [number, number]) => void) | undefined;
  /** Weather layers to draw (radar, echo tops, advisories, pilot reports). */
  weather?: WeatherMapState | undefined;
  /** A click on a weather item (its id), or null when the click hit none. */
  onWeatherPick?: ((id: string | null) => void) | undefined;
  /** The route line and airspace areas to draw (Phase 8). */
  routeAirspace?: RouteAirspaceState | undefined;
  /** A click on an airspace area (its id), or null when the click hit none. */
  onAirspacePick?: ((id: string | null) => void) | undefined;
}

/*
 * Aircraft motion (Phase 20). Each aircraft keeps its recent position reports as samples with their true
 * times. The map draws the world `delay` milliseconds in the past, so a drawn position is interpolated between
 * two real reports and not guessed. See src/lib/smooth-motion.ts for the rules (delay, gaps, dead reckoning).
 */
export interface Track {
  /** Latest data for this aircraft (labels, colour source, panel). */
  a: Aircraft;
  samples: readonly MotionSample[];
  color: string;
  emg: boolean;
  /** Missing from the data (not just filtered out): kept for a while, then faded and removed. */
  ghost: boolean;
}

/**
 * The FlightMap component's refs, shared by the map modules. Every field is a stable ref, so a module may keep this
 * object for the life of the map and always read the current props, map and tracks through it.
 */
export interface MapCtx {
  mapRef: RefObject<MLMap | null>;
  propsRef: RefObject<FlightMapProps>;
  rulerLabelRef: RefObject<HTMLDivElement | null>;
  tracksRef: RefObject<Map<string, Track>>;
  /** Replay (Phase 9a): the recording as tracks in the same shape as live ones. */
  replayTracksRef: RefObject<Map<string, Track> | null>;
  delayRef: RefObject<DelayState>;
  lastDelaySecRef: RefObject<number | null>;
  elevCacheRef: RefObject<Map<string, ElevationCacheEntry>>;
  lastGlideStatusRef: RefObject<GlideStatus | null>;
  styleReadyRef: RefObject<boolean>;
  /** True once the deferred scene (buildings, terrain) is installed for the current style. */
  sceneReadyRef: RefObject<boolean>;
}
