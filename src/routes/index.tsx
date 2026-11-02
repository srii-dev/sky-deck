import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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

  const feed = useAircraftFeed(viewport, selectedHex);

  const visible = useMemo(
    () => feed.aircraft.filter((a) => a.hex === selectedHex || passesFilters(a, filters)),
    [feed.aircraft, filters, selectedHex],
  );
  const emergencies = useMemo(
    () => feed.aircraft.filter((a) => isEmergency(a.squawk)),
    [feed.aircraft],
  );
  const selected = useMemo(
    () => feed.aircraft.find((a) => a.hex === selectedHex) ?? null,
    [feed.aircraft, selectedHex],
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

  const onSelect = useCallback((hex: string | null) => {
    setSelectedHex(hex);
    if (!hex) setFollow(false);
  }, []);

  const filterCount = activeFilterCount(filters);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
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
          />
        </Suspense>
      </ClientOnly>

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 md:flex-row md:items-start">
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
            total={feed.aircraft.length}
            source={feed.source}
          />
        </div>

        <div className="pointer-events-auto w-full md:max-w-sm">
          <SearchBox
            aircraft={feed.aircraft}
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
        <div className="pointer-events-none absolute inset-x-0 top-[176px] z-30 flex justify-center px-3 md:top-[72px]">
          <EmergencyBanner aircraft={emergencies} onPick={pickAircraft} />
        </div>
      )}

      {feed.error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center">
          <div className="glass-panel rounded-md px-3 py-1.5 text-xs text-warning">
            {feed.error}
          </div>
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
          onClose={() => onSelect(null)}
        />
      )}
    </main>
  );
}
