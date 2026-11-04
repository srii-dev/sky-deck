import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mountain, SlidersHorizontal, Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LiveIndicator } from "@/components/skydeck/LiveIndicator";
import { SearchBox } from "@/components/skydeck/SearchBox";
import { FiltersPanel } from "@/components/skydeck/FiltersPanel";
import { AircraftPanel } from "@/components/skydeck/AircraftPanel";
import { EmergencyBanner } from "@/components/skydeck/EmergencyBanner";
import { AltitudeLegend } from "@/components/skydeck/AltitudeLegend";
import { AircraftTypesLegend } from "@/components/skydeck/AircraftTypesLegend";
import type { Basemap, FlyTarget, Viewport } from "@/components/skydeck/map-config";
import type { GlideStatus } from "@/components/skydeck/FlightMap";
import { useAircraftFeed } from "@/hooks/use-aircraft-feed";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  isEmergency,
  passesFilters,
  type Aircraft,
  type Filters,
} from "@/lib/aircraft";
import { UNIT_LABELS, type UnitSystem } from "@/lib/units";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";

const FlightMap = lazy(() => import("@/components/skydeck/FlightMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} — ${APP_TAGLINE}` },
      {
        name: "description",
        content:
          "Track live aircraft on a 3D map with altitude-colored trails, search, filters and emergency squawk alerts.",
      },
      { property: "og:title", content: `${APP_NAME} — ${APP_TAGLINE}` },
      {
        property: "og:description",
        content:
          "Live ADS-B aircraft on a 3D terrain map with trails, filters and emergency alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SkyDeck,
});

function MapFallback() {
  return (
    <div className="scanline absolute inset-0 flex items-center justify-center bg-background">
      <span className="hud-label animate-pulse">Initializing display…</span>
    </div>
  );
}

function SkyDeck() {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [terrain, setTerrain] = useState(true);
  const [trail3d, setTrail3d] = useState(false);
  const [follow, setFollow] = useState(false);
  const [units, setUnits] = useState<UnitSystem>("aviation");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [glideRing, setGlideRing] = useState(false);
  const [glideRatio, setGlideRatio] = useState<number | null>(null);
  const [glideStatus, setGlideStatus] = useState<GlideStatus | undefined>(undefined);
  const [hudH, setHudH] = useState(76);
  const hudRef = useRef<HTMLDivElement>(null);
  const [isMock, setIsMock] = useState(false);
  const [mockAircraft, setMockAircraft] = useState<Aircraft[]>([]);

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsMock(params.get("mock") === "1");
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && isMock && viewport) {
      void import("@/lib/mock-fixture.dev").then(({ generateDevMockAircraft }) => {
        setMockAircraft(generateDevMockAircraft(viewport.lat, viewport.lon));
      });
    }
  }, [isMock, viewport?.lat, viewport?.lon]);

  useEffect(() => {
    const el = hudRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        if (height > 0) setHudH(height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Restore preferences after hydration.
  useEffect(() => {
    try {
      const u = localStorage.getItem("skydeck:units") as UnitSystem | null;
      if (u && u in UNIT_LABELS) setUnits(u);
      const b = localStorage.getItem("skydeck:basemap") as Basemap | null;
      if (b === "dark" || b === "light" || b === "satellite") setBasemap(b);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("skydeck:units", units);
      localStorage.setItem("skydeck:basemap", basemap);
    } catch {
      /* ignore */
    }
  }, [units, basemap]);

  // Debounce viewport changes so panning doesn't spam the feed.
  const [pendingViewport, setPendingViewport] = useState<Viewport | null>(null);
  useEffect(() => {
    if (!pendingViewport) return;
    const t = setTimeout(() => setViewport(pendingViewport), viewport ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingViewport]);

  const feed = useAircraftFeed(viewport, selectedHex?.startsWith("mock-") ? null : selectedHex);

  const allAircraft = useMemo(() => {
    if (mockAircraft.length > 0) {
      return [...feed.aircraft, ...mockAircraft];
    }
    return feed.aircraft;
  }, [feed.aircraft, mockAircraft]);

  const visible = useMemo(
    () => allAircraft.filter((a) => a.hex === selectedHex || passesFilters(a, filters)),
    [allAircraft, filters, selectedHex],
  );
  const emergencies = useMemo(
    () => feed.aircraft.filter((a) => isEmergency(a.squawk)),
    [feed.aircraft],
  );
  const selected = useMemo(
    () => allAircraft.find((a) => a.hex === selectedHex) ?? null,
    [allAircraft, selectedHex],
  );

  const flyTo = useCallback((lat: number, lon: number, zoom?: number) => {
    setFlyTarget({ id: Date.now(), lat, lon, zoom });
  }, []);

  const pickAircraft = useCallback(
    (a: Aircraft) => {
      setSelectedHex(a.hex);
      flyTo(a.lat, a.lon, 10);
    },
    [flyTo],
  );

  useEffect(() => {
    setGlideRatio(null);
  }, [selectedHex]);

  const onSelect = useCallback((hex: string | null) => {
    setSelectedHex(hex);
    if (!hex) {
      setFollow(false);
    }
  }, []);

  const filterCount = activeFilterCount(filters);

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-background"
      style={
        {
          "--hud-h": `${hudH}px`,
        } as React.CSSProperties
      }
    >
      <h1 className="sr-only">
        {APP_NAME} — {APP_TAGLINE}
      </h1>
      <ClientOnly fallback={<MapFallback />}>
        <Suspense fallback={<MapFallback />}>
          <FlightMap
            aircraft={visible}
            selectedHex={selectedHex}
            onSelect={onSelect}
            trail={feed.trail}
            trail3d={trail3d}
            basemap={basemap}
            terrain={terrain}
            follow={follow}
            flyTarget={flyTarget}
            onViewportChange={setPendingViewport}
            glideRing={glideRing}
            glideRatio={glideRatio}
            onGlideStatus={setGlideStatus}
          />
        </Suspense>
      </ClientOnly>

      {/* Top HUD */}
      <div
        ref={hudRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 md:flex-row md:items-start"
      >
        <div className="glass-panel pointer-events-auto flex h-11 items-center gap-4 rounded-md px-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-base font-bold tracking-[0.18em] text-primary">
              {APP_NAME.toUpperCase()}
            </span>
          </div>
          <span className="h-5 w-px bg-border" />
          <LiveIndicator
            fetchedAt={feed.fetchedAt}
            error={feed.error}
            isFetching={feed.isFetching}
            shown={visible.length}
            total={allAircraft.length}
            source={feed.source}
          />
        </div>

        <div className="pointer-events-auto w-full md:max-w-sm">
          <SearchBox
            aircraft={allAircraft}
            onAircraft={pickAircraft}
            onAirport={(apt) => flyTo(apt.lat, apt.lon, 11)}
          />
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2 md:ml-auto">
          <div className="glass-panel flex h-11 items-center rounded-md px-1">
            <ToggleGroup
              type="single"
              variant="hud"
              size="sm"
              value={basemap}
              onValueChange={(v) => v && setBasemap(v as Basemap)}
              aria-label="Map style"
            >
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
              <ToggleGroupItem value="satellite">Sat</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="glass-panel flex h-11 items-center rounded-md px-1">
            <Button
              variant="hud"
              size="sm"
              data-active={terrain}
              onClick={() => setTerrain((t) => !t)}
              aria-pressed={terrain}
              aria-label="3D terrain"
              title="3D terrain"
            >
              <Mountain />
              <span className="hidden font-display text-xs uppercase tracking-wider lg:inline">
                Terrain
              </span>
            </Button>
            <Button
              variant="hud"
              size="sm"
              data-active={trail3d}
              onClick={() => setTrail3d((t) => !t)}
              aria-pressed={trail3d}
              aria-label="3D trail"
              title="Show selected trail in 3D"
            >
              <Box />
              <span className="hidden font-display text-xs uppercase tracking-wider lg:inline">
                3D trail
              </span>
            </Button>
          </div>
          <div className="glass-panel flex h-11 items-center rounded-md px-1">
            <ToggleGroup
              type="single"
              variant="hud"
              size="sm"
              value={units}
              onValueChange={(v) => v && setUnits(v as UnitSystem)}
              aria-label="Units"
            >
              <ToggleGroupItem value="aviation" title="ft · kt · ft/min">
                AVN
              </ToggleGroupItem>
              <ToggleGroupItem value="metric" title="m · km/h · m/s">
                MET
              </ToggleGroupItem>
              <ToggleGroupItem value="imperial" title="ft · mph · ft/min">
                IMP
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="panel"
                size="icon"
                className="relative h-11 w-11"
                aria-label="Filters"
                data-active={filterCount > 0}
              >
                <SlidersHorizontal />
                {filterCount > 0 && (
                  <span className="data-value absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {filterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="glass-panel w-80">
              <FiltersPanel
                filters={filters}
                onChange={setFilters}
                aircraft={feed.aircraft}
                units={units}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Emergency alert */}
      {emergencies.length > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3"
          style={{ top: "calc(var(--hud-h, 76px) + 8px)" }}
        >
          <EmergencyBanner aircraft={emergencies} onPick={pickAircraft} />
        </div>
      )}

      {(feed.error || feed.areasMissing || feed.partial) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-1.5">
          {feed.error && (
            <div className="glass-panel rounded-md px-3 py-1.5 text-xs text-warning">
              {feed.error}
            </div>
          )}
          {feed.areasMissing && (
            <div className="glass-panel rounded-md px-3 py-1.5 text-xs text-muted-foreground">
              Some areas may be missing
            </div>
          )}
          {feed.partial && (
            <div className="glass-panel rounded-md px-3 py-1.5 text-xs text-muted-foreground">
              Showing part of this view. Zoom in for full coverage.
            </div>
          )}
        </div>
      )}

      {
        <div
          className={`pointer-events-none absolute bottom-3 left-3 z-20 ${selected ? "hidden md:block" : ""}`}
        >
          <div className="mb-2 hidden md:block">
            <AircraftTypesLegend />
          </div>
          <AltitudeLegend units={units} />
        </div>
      }

      {selected && (
        <AircraftPanel
          key={selected.hex}
          aircraft={selected}
          units={units}
          trail3d={trail3d}
          onTrail3d={setTrail3d}
          follow={follow}
          onFollow={setFollow}
          glideRing={glideRing}
          onGlideRing={setGlideRing}
          glideRatio={glideRatio}
          onGlideRatio={setGlideRatio}
          glideStatus={glideStatus}
          onClose={() => onSelect(null)}
        />
      )}
    </main>
  );
}
