import type { Map as MLMap } from "maplibre-gl";

/*
 * A stand-in for the parts of a MapLibre map the layer builders use. It refuses what MapLibre refuses (a duplicate,
 * a layer without its source or before a missing layer, removing a source still in use), so wrong order fails a test.
 */

export interface FakeLayer {
  id: string;
  type?: string;
  source?: string;
  minzoom?: number;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

export function fakeMap(basemapLayers: FakeLayer[] = []) {
  const sources = new Map<string, { spec: Record<string, unknown>; data?: unknown }>();
  const layers: FakeLayer[] = [...basemapLayers];
  const images = new Set<string>();
  const idle: (() => void)[] = [];
  const state = { styleLoaded: true, terrain: null as unknown, features: [] as unknown[] };
  const indexOf = (id: string) => layers.findIndex((l) => l.id === id);

  const map = {
    _removed: false,
    getStyle: () => ({ layers }),
    isStyleLoaded: () => state.styleLoaded,
    getSource: (id: string) => {
      const s = sources.get(id);
      return s && { setData: (d: unknown) => (s.data = d), setTiles: () => {} };
    },
    addSource: (id: string, spec: Record<string, unknown>) => {
      if (sources.has(id)) throw new Error("duplicate source " + id);
      sources.set(id, { spec, data: spec["data"] });
    },
    removeSource: (id: string) => {
      if (layers.some((l) => l.source === id)) throw new Error("source in use " + id);
      sources.delete(id);
    },
    getLayer: (id: string) => layers[indexOf(id)],
    addLayer: (spec: FakeLayer, before?: string) => {
      if (indexOf(spec.id) >= 0) throw new Error("duplicate layer " + spec.id);
      if (spec.source && !sources.has(spec.source)) throw new Error("no source " + spec.source);
      if (before === undefined) layers.push(spec);
      else if (indexOf(before) < 0) throw new Error("no layer " + before);
      else layers.splice(indexOf(before), 0, spec);
    },
    removeLayer: (id: string) => {
      if (indexOf(id) < 0) throw new Error("no layer " + id);
      layers.splice(indexOf(id), 1);
    },
    setPaintProperty: () => {},
    setLayoutProperty: (id: string, key: string, value: unknown) => {
      const l = layers[indexOf(id)];
      if (l) l.layout = { ...l.layout, [key]: value };
    },
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => {
      if (images.has(id)) throw new Error("duplicate image " + id);
      images.add(id);
    },
    getTerrain: () => state.terrain,
    setTerrain: (t: unknown) => (state.terrain = t),
    queryRenderedFeatures: () => state.features,
    once: (_event: string, fn: () => void) => idle.push(fn),
  };

  return {
    map: map as unknown as MLMap,
    raw: map,
    sources,
    layers,
    images,
    state,
    ids: () => layers.map((l) => l.id),
    fireIdle: () => idle.splice(0).forEach((fn) => fn()),
    /** What a basemap switch does: the style, with every source, layer and image, is replaced. */
    swapStyle: () => {
      sources.clear();
      images.clear();
      layers.splice(0, layers.length, ...basemapLayers);
      state.terrain = null;
    },
  };
}
