import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiLineString, Point, Polygon } from "geojson";

import { KIND_COLORS, type Airspace } from "@/lib/airspace";
import { routeLineParts, type LatLon } from "@/lib/route-geometry";

/*
 * Map layers for the route line (Phase 8a) and the airspace areas (Phase 8d, special use areas from 8c).
 * Like every overlay they are removed by a basemap switch, so applyRouteAirspace is called again from the map's
 * style.load handler as well as when the wanted state changes. It adds what is wanted, updates what exists and
 * removes what is not wanted, so calling it twice with the same state changes nothing.
 */

export interface RouteLine {
  origin: LatLon & { label: string };
  destination: LatLon & { label: string };
}

export interface RouteAirspaceState {
  route: RouteLine | null;
  /** Areas to draw, or null when both airspace layers are off. */
  airspace: Airspace[] | null;
}

export const NO_ROUTE_AIRSPACE: RouteAirspaceState = { route: null, airspace: null };

export const ROUTE_AIRSPACE_IDS = {
  routeSource: "sd-route",
  routeLine: "sd-route-line",
  endsSource: "sd-route-ends",
  endsDot: "sd-route-end-dot",
  endsLabel: "sd-route-end-label",
  airspaceSource: "sd-airspace",
  airspaceFill: "sd-airspace-fill",
  airspaceLine: "sd-airspace-line",
  airspaceLabel: "sd-airspace-label",
} as const;

const FONT = ["Noto Sans Regular"];
const ROUTE_COLOR = "#7dd3fc";

export function routeCollection(route: RouteLine): FeatureCollection<MultiLineString> {
  const parts = routeLineParts(route.origin, route.destination);
  const f: Feature<MultiLineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiLineString", coordinates: parts },
  };
  return { type: "FeatureCollection", features: [f] };
}

export function routeEndsCollection(route: RouteLine): FeatureCollection<Point> {
  const end = (p: LatLon & { label: string }): Feature<Point> => ({
    type: "Feature",
    properties: { label: p.label },
    geometry: { type: "Point", coordinates: [p.lon, p.lat] },
  });
  return { type: "FeatureCollection", features: [end(route.origin), end(route.destination)] };
}

/** Short label drawn on an area: "B KJFK", "D KTEB", "R-5802D". */
export function airspaceLabel(a: Airspace): string {
  if (a.layer === "special") return a.name;
  return a.icao ? a.kind + " " + a.icao.replace(/^K/, "") : a.kind;
}

export function airspaceCollection(list: readonly Airspace[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = list.map((a) => ({
    type: "Feature",
    properties: {
      id: a.id,
      color: KIND_COLORS[a.kind],
      label: airspaceLabel(a),
      special: a.layer === "special",
    },
    geometry: { type: "Polygon", coordinates: a.rings },
  }));
  return { type: "FeatureCollection", features };
}

function removeAll(map: MLMap, layers: string[], source: string) {
  for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(source)) map.removeSource(source);
}

function setData(map: MLMap, id: string, data: FeatureCollection) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

/** Make the map match `state`. `before` is the layer these go under (below trails and aircraft). */
export function applyRouteAirspace(map: MLMap, state: RouteAirspaceState, before?: string): void {
  if (map._removed) return;
  const beforeId = before && map.getLayer(before) ? before : undefined;
  const ids = ROUTE_AIRSPACE_IDS;

  // Airspace goes in first so the route line and its ends are drawn above it.
  if (state.airspace) {
    const data = airspaceCollection(state.airspace);
    if (!map.getSource(ids.airspaceSource))
      map.addSource(ids.airspaceSource, { type: "geojson", data });
    else setData(map, ids.airspaceSource, data);
    if (!map.getLayer(ids.airspaceFill)) {
      map.addLayer(
        {
          id: ids.airspaceFill,
          type: "fill",
          source: ids.airspaceSource,
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": ["case", ["get", "special"], 0.14, 0.07],
          },
        },
        beforeId,
      );
    }
    if (!map.getLayer(ids.airspaceLine)) {
      map.addLayer(
        {
          id: ids.airspaceLine,
          type: "line",
          source: ids.airspaceSource,
          paint: { "line-color": ["get", "color"], "line-width": 1.4, "line-opacity": 0.8 },
        },
        beforeId,
      );
    }
    if (!map.getLayer(ids.airspaceLabel)) {
      map.addLayer(
        {
          id: ids.airspaceLabel,
          type: "symbol",
          source: ids.airspaceSource,
          minzoom: 7,
          layout: {
            "text-field": ["get", "label"],
            "text-font": FONT,
            "text-size": 10,
            "text-optional": true,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": ["get", "color"],
            "text-halo-color": "rgba(5,10,18,0.9)",
            "text-halo-width": 1.2,
          },
        },
        beforeId,
      );
    }
  } else {
    removeAll(map, [ids.airspaceLabel, ids.airspaceLine, ids.airspaceFill], ids.airspaceSource);
  }

  if (state.route) {
    const line = routeCollection(state.route);
    const ends = routeEndsCollection(state.route);
    if (!map.getSource(ids.routeSource))
      map.addSource(ids.routeSource, { type: "geojson", data: line });
    else setData(map, ids.routeSource, line);
    if (!map.getSource(ids.endsSource))
      map.addSource(ids.endsSource, { type: "geojson", data: ends });
    else setData(map, ids.endsSource, ends);
    if (!map.getLayer(ids.routeLine)) {
      map.addLayer(
        {
          id: ids.routeLine,
          type: "line",
          source: ids.routeSource,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ROUTE_COLOR,
            "line-width": 2,
            "line-dasharray": [2, 2],
            "line-opacity": 0.85,
          },
        },
        beforeId,
      );
    }
    if (!map.getLayer(ids.endsDot)) {
      map.addLayer(
        {
          id: ids.endsDot,
          type: "circle",
          source: ids.endsSource,
          paint: {
            "circle-radius": 4,
            "circle-color": ROUTE_COLOR,
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(5,10,18,0.9)",
          },
        },
        beforeId,
      );
    }
    if (!map.getLayer(ids.endsLabel)) {
      map.addLayer(
        {
          id: ids.endsLabel,
          type: "symbol",
          source: ids.endsSource,
          layout: {
            "text-field": ["get", "label"],
            "text-font": FONT,
            "text-size": 11,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: {
            "text-color": ROUTE_COLOR,
            "text-halo-color": "rgba(5,10,18,0.9)",
            "text-halo-width": 1.3,
          },
        },
        beforeId,
      );
    }
  } else {
    removeAll(map, [ids.routeLine], ids.routeSource);
    removeAll(map, [ids.endsLabel, ids.endsDot], ids.endsSource);
  }
}

/** The airspace area under a click, if any. Smaller areas are listed first by the map, so the top one wins. */
export function pickAirspace(map: MLMap, point: { x: number; y: number }): string | null {
  if (!map.getLayer(ROUTE_AIRSPACE_IDS.airspaceFill)) return null;
  const feats = map.queryRenderedFeatures([point.x, point.y], {
    layers: [ROUTE_AIRSPACE_IDS.airspaceFill],
  });
  const id = feats[0]?.properties?.["id"];
  return typeof id === "string" ? id : null;
}
