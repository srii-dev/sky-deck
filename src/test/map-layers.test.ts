import { describe, expect, it } from "vitest";

import {
  ALERT_AREA_IDS,
  alertAreaCollection,
  applyAlertAreas,
  circleRing,
  destinationPoint,
} from "@/components/skydeck/alert-area-layers";
import { applyNight, NIGHT_IDS, nightCollection } from "@/components/skydeck/night-layers";
import {
  airspaceCollection,
  airspaceLabel,
  applyRouteAirspace,
  NO_ROUTE_AIRSPACE,
  pickAirspace,
  ROUTE_AIRSPACE_IDS,
  routeEndsCollection,
  type RouteLine,
} from "@/components/skydeck/route-airspace-layers";
import { KIND_COLORS, type Airspace } from "@/lib/airspace";
import type { AlertArea } from "@/lib/alert-rules";
import { fakeMap } from "./fake-map";

/* The night, alert area, route and airspace layer builders. */

const TOP = { id: "sd-trail-line" };
const NOON = new Date("2026-06-21T12:00:00Z");
const MIDNIGHT = new Date("2026-06-21T00:00:00Z");

describe("night layers", () => {
  const ids = [NIGHT_IDS.fill, NIGHT_IDS.line];

  it("builds one closed polygon", () => {
    const ring = nightCollection(NOON).features[0]!.geometry.coordinates[0]!;
    expect(ring.length).toBeGreaterThan(3);
    expect(ring.at(-1)).toEqual(ring[0]);
  });

  it("adds once under the given layer, updates the data, and removes it all", () => {
    const m = fakeMap([TOP]);
    applyNight(m.map, true, NOON, TOP.id);
    applyNight(m.map, true, MIDNIGHT, TOP.id);
    expect(m.ids()).toEqual([...ids, TOP.id]);
    expect(m.sources.get(NIGHT_IDS.source)!.data).toEqual(nightCollection(MIDNIGHT));

    applyNight(m.map, false, NOON);
    applyNight(m.map, false, NOON);
    expect(m.ids()).toEqual([TOP.id]);
    expect(m.sources.size).toBe(0);
  });

  it("goes on top when the layer to sit under is missing", () => {
    const m = fakeMap([TOP]);
    applyNight(m.map, true, NOON, "gone");
    expect(m.ids()).toEqual([TOP.id, ...ids]);
  });

  it("leaves a removed or half-swapped map alone without throwing", () => {
    const removed = fakeMap();
    removed.raw._removed = true;
    applyNight(removed.map, true, NOON);
    expect(removed.sources.size).toBe(0);

    const swapping = fakeMap();
    swapping.raw.addSource = () => {
      throw new Error("Style is not done loading");
    };
    expect(() => applyNight(swapping.map, true, NOON)).not.toThrow();
  });
});

describe("alert area layers", () => {
  const area: AlertArea = { label: "Home", lat: 42, lon: -71, radiusNm: 60 };
  const ids = [ALERT_AREA_IDS.fill, ALERT_AREA_IDS.line, ALERT_AREA_IDS.label];

  it("measures nautical miles and wraps longitude at the date line", () => {
    const [lon, lat] = destinationPoint({ lat: 0, lon: 0 }, 0, 60);
    expect(lon).toBeCloseTo(0);
    expect(lat).toBeCloseTo(1, 1);
    expect(destinationPoint({ lat: 0, lon: 179.5 }, 90, 60)[0]).toBeCloseTo(-179.5, 1);
  });

  it("draws a closed circle with a label and the preview flag", () => {
    const ring = circleRing(area, 8);
    expect(ring).toHaveLength(9);
    expect(ring[8]).toEqual(ring[0]);
    const features = alertAreaCollection([
      { id: "a", area },
      { id: "b", area, preview: true },
    ]).features;
    expect(features.map((f) => f.properties)).toEqual([
      { id: "a", label: "Home 60 nm", preview: false },
      { id: "b", label: "Home 60 nm", preview: true },
    ]);
  });

  it("adds once under the given layer, updates the data, and removes it all", () => {
    const m = fakeMap([TOP]);
    applyAlertAreas(m.map, [{ id: "a", area }], TOP.id);
    applyAlertAreas(m.map, [{ id: "b", area }], TOP.id);
    expect(m.ids()).toEqual([...ids, TOP.id]);
    expect(m.sources.get(ALERT_AREA_IDS.source)!.data).toEqual(
      alertAreaCollection([{ id: "b", area }]),
    );

    applyAlertAreas(m.map, []);
    expect(m.ids()).toEqual([TOP.id]);
    expect(m.sources.size).toBe(0);
  });

  it("does nothing on a removed map", () => {
    const m = fakeMap();
    m.raw._removed = true;
    applyAlertAreas(m.map, [{ id: "a", area }]);
    expect(m.sources.size).toBe(0);
  });
});

describe("route and airspace layers", () => {
  const ids = ROUTE_AIRSPACE_IDS;
  const route: RouteLine = {
    origin: { lat: 42, lon: -71, label: "BOS" },
    destination: { lat: 51, lon: 0, label: "LHR" },
  };
  const area: Airspace = {
    id: "k",
    layer: "class",
    kind: "B",
    name: "Boston Class B",
    icao: "KBOS",
    rings: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  } as Airspace;
  const AIRSPACE_LAYERS = [ids.airspaceFill, ids.airspaceLine, ids.airspaceLabel];
  const ROUTE_LAYERS = [ids.routeLine, ids.endsDot, ids.endsLabel];

  it("labels areas and puts coordinates in longitude, latitude order", () => {
    expect(airspaceLabel(area)).toBe("B BOS");
    expect(airspaceLabel({ ...area, icao: null } as Airspace)).toBe("B");
    expect(airspaceLabel({ ...area, layer: "special", name: "R-5802D" } as Airspace)).toBe(
      "R-5802D",
    );
    expect(airspaceCollection([area]).features[0]!.properties).toEqual({
      id: "k",
      color: KIND_COLORS.B,
      label: "B BOS",
      special: false,
    });
    expect(routeEndsCollection(route).features.map((f) => f.geometry.coordinates)).toEqual([
      [-71, 42],
      [0, 51],
    ]);
  });

  it("draws the route above the airspace, under the given layer, and only once", () => {
    const m = fakeMap([TOP]);
    const state = { route, airspace: [area] };
    applyRouteAirspace(m.map, state, TOP.id);
    applyRouteAirspace(m.map, state, TOP.id);
    expect(m.ids()).toEqual([...AIRSPACE_LAYERS, ...ROUTE_LAYERS, TOP.id]);
  });

  it("updates data in place", () => {
    const m = fakeMap();
    applyRouteAirspace(m.map, { route, airspace: [area] });
    const back = { origin: route.destination, destination: route.origin };
    applyRouteAirspace(m.map, { route: back, airspace: [] });
    expect(m.sources.get(ids.endsSource)!.data).toEqual(routeEndsCollection(back));
    expect(m.sources.get(ids.airspaceSource)!.data).toEqual(airspaceCollection([]));
  });

  it("removes each part on its own", () => {
    const m = fakeMap();
    applyRouteAirspace(m.map, { route, airspace: [area] });
    applyRouteAirspace(m.map, { route, airspace: null });
    expect(m.ids()).toEqual(ROUTE_LAYERS);
    applyRouteAirspace(m.map, NO_ROUTE_AIRSPACE);
    expect(m.ids()).toEqual([]);
    expect(m.sources.size).toBe(0);
  });

  it("does nothing on a removed map", () => {
    const m = fakeMap();
    m.raw._removed = true;
    applyRouteAirspace(m.map, { route, airspace: [area] });
    expect(m.sources.size).toBe(0);
  });

  it("picks the area under a click", () => {
    const m = fakeMap();
    const at = { x: 1, y: 2 };
    m.state.features = [{ properties: { id: "k" } }];
    expect(pickAirspace(m.map, at)).toBeNull();
    applyRouteAirspace(m.map, { route: null, airspace: [area] });
    expect(pickAirspace(m.map, at)).toBe("k");
    m.state.features = [{ properties: { id: 4 } }];
    expect(pickAirspace(m.map, at)).toBeNull();
    m.state.features = [];
    expect(pickAirspace(m.map, at)).toBeNull();
  });
});
