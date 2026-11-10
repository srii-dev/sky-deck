import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Mountain, Radio, SlidersHorizontal, Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LiveIndicator } from "@/components/skydeck/LiveIndicator";
import { SearchBox } from "@/components/skydeck/SearchBox";
import { FiltersPanel } from "@/components/skydeck/FiltersPanel";
import { AircraftPanel } from "@/components/skydeck/AircraftPanel";
import { AirportPanel } from "@/components/skydeck/AirportPanel";
import { NearbyAirports } from "@/components/skydeck/NearbyAirports";
import { RadarTimeline } from "@/components/skydeck/RadarTimeline";
import { WeatherInfoCard, type WeatherItem } from "@/components/skydeck/WeatherInfoCard";
import { useWeatherLayers } from "@/hooks/use-weather-layers";
import { useAirspace } from "@/hooks/use-airspace";
import { AirspaceInfoCard } from "@/components/skydeck/AirspaceInfoCard";
import type { RouteAirspaceState } from "@/components/skydeck/route-airspace-layers";
import { isDrawableRoute } from "@/lib/route-geometry";
import { getFlightRoute } from "@/lib/adsb.functions";
import { CreditsDialog } from "@/components/skydeck/CreditsDialog";
import { FirstRunGuide } from "@/components/skydeck/FirstRunGuide";
import { AccountDialog } from "@/components/skydeck/AccountDialog";
import { useAuth } from "@/hooks/use-auth";
import { hasStoredSession } from "@/lib/supabase-client";
import { SettingsDialog } from "@/components/skydeck/SettingsDialog";
import { ShortcutsDialog } from "@/components/skydeck/ShortcutsDialog";
import { EmergencyBanner } from "@/components/skydeck/EmergencyBanner";
import { AltitudeLegend } from "@/components/skydeck/AltitudeLegend";
import { AircraftTypesLegend } from "@/components/skydeck/AircraftTypesLegend";
import { MapTools } from "@/components/skydeck/MapTools";
import type { Basemap, FlyTarget, Viewport } from "@/components/skydeck/map-config";
import type { GlideStatus } from "@/components/skydeck/FlightMap";
import { useAircraftFeed } from "@/hooks/use-aircraft-feed";
import { useFlagPref } from "@/hooks/use-flag-pref";
import { usePersonalData } from "@/hooks/use-personal-data";
import { useWatchAlerts } from "@/hooks/use-watch-alerts";
import { WatchlistDialog } from "@/components/skydeck/WatchlistDialog";
import { ReplayBar } from "@/components/skydeck/ReplayBar";
import { AlertRulesDialog } from "@/components/skydeck/AlertRulesDialog";
import { EMPTY_DRAFT, type RuleDraft } from "@/lib/alert-rule-draft";
import type { AlertAreaDrawing } from "@/components/skydeck/alert-area-layers";
import { useAlertRules } from "@/hooks/use-alert-rules";
import { useFlightStages } from "@/hooks/use-flight-stages";
import { normalizeKey } from "@/lib/watchlist";
import { resolvePlace } from "@/lib/place-resolver";
import { distanceNm } from "@/lib/route-geometry";
import { useReplay } from "@/hooks/use-replay";
import { watchMatches, type RecentFlight, type WatchItem } from "@/lib/watchlist";
import { useShortcuts } from "@/hooks/use-shortcuts";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  isEmergency,
  passesFilters,
  type Aircraft,
  type Filters,
} from "@/lib/aircraft";
import type { Airport } from "@/lib/airports";
import { currentAirportList, loadLargeAirports } from "@/lib/airport-list";
import { nearbyAirports, type NearbyAirport } from "@/lib/nearby-airports";
import { nextRulerPoints, rulerSummary, type LngLat } from "@/lib/measure";
import type { MotionState } from "@/lib/smooth-motion";
import { buildShareSearch, parseShareParams } from "@/lib/share-link";
import { shouldAutoShowGuide } from "@/lib/first-run";
import { pollIntervalMs, readFlagPref, STORAGE_KEYS, writeFlagPref } from "@/lib/local-settings";
import { escapeTarget, SEARCH_INPUT_ID, stepAircraft, type ShortcutAction } from "@/lib/shortcuts";
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
  const [airport, setAirport] = useState<Airport | null>(null);
  const [nearby, setNearby] = useState<NearbyAirport[] | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [terrain, setTerrain] = useState(true);
  const [trail3d, setTrail3d] = useState(false);
  const [radarOn, setRadarOn] = useState(false);
  const [echoTopsOn, setEchoTopsOn] = useState(false);
  const [advisoriesOn, setAdvisoriesOn] = useState(false);
  const [pirepsOn, setPirepsOn] = useState(false);
  const [weatherPickId, setWeatherPickId] = useState<string | null>(null);
  const [routeOn, setRouteOn] = useState(true);
  const [airspaceControlledOn, setAirspaceControlledOn] = useState(false);
  const [airspaceSpecialOn, setAirspaceSpecialOn] = useState(false);
  const [airspacePickId, setAirspacePickId] = useState<string | null>(null);
  const [showTrail, setShowTrail] = useState(true);
  const [rulerActive, setRulerActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<LngLat[]>([]);
  const [follow, setFollow] = useState(false);
  const [chase, setChase] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [units, setUnits] = useState<UnitSystem>("aviation");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [glideRing, setGlideRing] = useState(false);
  const [glideRatio, setGlideRatio] = useState<number | null>(null);
  const [glideStatus, setGlideStatus] = useState<GlideStatus | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // Sign-in state is shared with the lists that sync. It only contacts Supabase once the account dialog was
  // opened or this browser already holds a saved session.
  const [accountEverOpened, setAccountEverOpened] = useState(false);
  const [storedSession, setStoredSession] = useState(false);
  useEffect(() => setStoredSession(hasStoredSession()), []);
  const auth = useAuth(accountEverOpened || storedSession);
  // However the dialog is opened (Settings, the watchlist's sign-in link), sign-in becomes active.
  useEffect(() => {
    if (accountOpen) setAccountEverOpened(true);
  }, [accountOpen]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shortcutsOn, setShortcutsOn] = useFlagPref(STORAGE_KEYS.shortcuts, true);
  const [batterySaver, setBatterySaver] = useFlagPref(STORAGE_KEYS.batterySaver, false);
  const [alertsOn, setAlertsOn] = useFlagPref(STORAGE_KEYS.watchAlerts, true);
  const [smoothMotion, setSmoothMotion] = useFlagPref(STORAGE_KEYS.smoothMotion, true);
  const [motionDelaySec, setMotionDelaySec] = useState<number | null>(null);
  const [selectedMotion, setSelectedMotion] = useState<{ hex: string; m: MotionState } | null>(
    null,
  );
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

  // Layer choices are remembered in this browser (the glide ring belongs to one aircraft, so it is not).
  const [layersReady, setLayersReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("skydeck:layers");
      if (raw) {
        const l = JSON.parse(raw) as Record<string, unknown>;
        if (typeof l["terrain"] === "boolean") setTerrain(l["terrain"]);
        if (typeof l["showTrail"] === "boolean") setShowTrail(l["showTrail"]);
        if (typeof l["trail3d"] === "boolean") setTrail3d(l["trail3d"]);
        if (typeof l["radar"] === "boolean") setRadarOn(l["radar"]);
        if (typeof l["echoTops"] === "boolean") setEchoTopsOn(l["echoTops"]);
        if (typeof l["advisories"] === "boolean") setAdvisoriesOn(l["advisories"]);
        if (typeof l["pireps"] === "boolean") setPirepsOn(l["pireps"]);
        if (typeof l["routeLine"] === "boolean") setRouteOn(l["routeLine"]);
        if (typeof l["airspaceControlled"] === "boolean")
          setAirspaceControlledOn(l["airspaceControlled"]);
        if (typeof l["airspaceSpecial"] === "boolean") setAirspaceSpecialOn(l["airspaceSpecial"]);
      }
    } catch {
      /* ignore */
    }
    setLayersReady(true);
  }, []);
  useEffect(() => {
    // Only save after the saved choices were read, so the defaults never overwrite them.
    if (!layersReady) return;
    try {
      localStorage.setItem(
        "skydeck:layers",
        JSON.stringify({
          terrain,
          showTrail,
          trail3d,
          radar: radarOn,
          echoTops: echoTopsOn,
          advisories: advisoriesOn,
          pireps: pirepsOn,
          routeLine: routeOn,
          airspaceControlled: airspaceControlledOn,
          airspaceSpecial: airspaceSpecialOn,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [
    layersReady,
    terrain,
    showTrail,
    trail3d,
    radarOn,
    echoTopsOn,
    advisoriesOn,
    pirepsOn,
    routeOn,
    airspaceControlledOn,
    airspaceSpecialOn,
  ]);

  // First visit: show the quick guide once (not over a shared link). Settings can reopen it.
  useEffect(() => {
    if (shouldAutoShowGuide(readFlagPref(STORAGE_KEYS.guideSeen, false), window.location.search)) {
      setGuideOpen(true);
    }
  }, []);

  // A shared link may carry a basemap and a selected aircraft (the map reads the view itself).
  useEffect(() => {
    const s = parseShareParams(window.location.search);
    if (s.basemap) setBasemap(s.basemap);
    if (s.hex) setSelectedHex(s.hex);
  }, []);

  // Debounce viewport changes so panning doesn't spam the feed.
  const [pendingViewport, setPendingViewport] = useState<Viewport | null>(null);
  useEffect(() => {
    if (!pendingViewport) return;
    const t = setTimeout(() => setViewport(pendingViewport), viewport ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingViewport]);

  // The address bar always describes the current view, so copying it shares that view.
  const currentView = pendingViewport ?? viewport;
  const shareHex = selectedHex && !selectedHex.startsWith("mock-") ? selectedHex : undefined;
  const buildSearch = useCallback(
    (existing: string) =>
      currentView && currentView.zoom !== undefined
        ? buildShareSearch(
            {
              lat: currentView.lat,
              lon: currentView.lon,
              zoom: currentView.zoom,
              pitch: currentView.pitch,
              bearing: currentView.bearing,
              hex: shareHex,
              basemap,
            },
            existing,
          )
        : null,
    [currentView, shareHex, basemap],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      const search = buildSearch(window.location.search);
      if (search === null) return;
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}?${search}${window.location.hash}`,
      );
    }, 500);
    return () => clearTimeout(t);
  }, [buildSearch]);
  const getShareUrl = useCallback(() => {
    const search = buildSearch(window.location.search);
    return `${window.location.origin}${window.location.pathname}${search ? `?${search}` : ""}`;
  }, [buildSearch]);

  const feed = useAircraftFeed(
    viewport,
    selectedHex?.startsWith("mock-") ? null : selectedHex,
    pollIntervalMs(batterySaver),
  );

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
  // Every aircraft in the data, before filters: the map keeps one that is only filtered out from lingering.
  const presentHexes = useMemo(() => new Set(allAircraft.map((a) => a.hex)), [allAircraft]);
  // The panel shows the selected aircraft at the moment the map draws it (a few seconds behind the newest
  // data), so the numbers and the icon agree. Before the first drawn state it shows the latest data.
  const panelAircraft = useMemo(() => {
    if (!selected || !smoothMotion) return selected;
    if (!selectedMotion || selectedMotion.hex !== selected.hex) return selected;
    const m = selectedMotion.m;
    return {
      ...selected,
      lat: m.lat,
      lon: m.lon,
      altFt: m.altFt,
      gs: m.gs,
      track: m.track,
      vRate: m.vRate,
      onGround: m.onGround,
    };
  }, [selected, selectedMotion, smoothMotion]);

  const flyTo = useCallback((lat: number, lon: number, zoom?: number) => {
    setFlyTarget({ id: Date.now(), lat, lon, zoom });
  }, []);

  const pickAircraft = useCallback(
    (a: Aircraft) => {
      setSelectedHex(a.hex);
      setAirport(null);
      flyTo(a.lat, a.lon, 10);
    },
    [flyTo],
  );

  useEffect(() => {
    setGlideRatio(null);
  }, [selectedHex]);

  const onSelect = useCallback((hex: string | null) => {
    setSelectedHex(hex);
    if (hex) setAirport(null);
    if (!hex) {
      setFollow(false);
    }
  }, []);

  const openAirport = useCallback(
    (apt: Airport) => {
      setSelectedHex(null);
      setFollow(false);
      setAirport(apt);
      flyTo(apt.lat, apt.lon, 11);
    },
    [flyTo],
  );

  const showNearby = useCallback((pos: { lat: number; lon: number }) => {
    const compute = () => setNearby(nearbyAirports(pos, currentAirportList()));
    compute();
    // The short built-in list answers at once; the larger list replaces it when it has loaded.
    loadLargeAirports().then(compute, () => undefined);
  }, []);

  const toggleRuler = useCallback(() => {
    setRulerActive((a) => !a);
    setRulerPoints([]);
  }, []);

  // Single-key shortcuts (22j). Each case returns true when it used the key.
  const handleShortcut = (action: ShortcutAction): boolean => {
    switch (action) {
      case "search":
        document.getElementById(SEARCH_INPUT_ID)?.focus();
        return true;
      case "help":
        setShortcutsOpen(true);
        return true;
      case "settings":
        setSettingsOpen(true);
        return true;
      case "next":
      case "previous": {
        const t = stepAircraft(visible, selectedHex, action === "next" ? 1 : -1);
        if (!t) return false;
        setSelectedHex(t.hex);
        setAirport(null);
        flyTo(t.lat, t.lon);
        return true;
      }
      case "terrain":
        setTerrain((v) => !v);
        return true;
      case "trail":
        setShowTrail((v) => !v);
        return true;
      case "trail3d":
        setTrail3d((v) => !v);
        return true;
      case "glide":
        if (!selected) return false;
        setGlideRing((v) => !v);
        return true;
      case "ruler":
        toggleRuler();
        return true;
      case "close": {
        const target = escapeTarget({
          ruler: rulerActive,
          aircraft: !!selectedHex,
          nearby: !!nearby,
          airport: !!airport,
        });
        if (target === "ruler") toggleRuler();
        else if (target === "aircraft") onSelect(null);
        else if (target === "nearby") setNearby(null);
        else if (target === "airport") setAirport(null);
        return target !== null;
      }
      default:
        return false;
    }
  };
  useShortcuts(shortcutsOn, handleShortcut);

  const weather = useWeatherLayers(
    { radar: radarOn, echoTops: echoTopsOn, advisories: advisoriesOn, pireps: pirepsOn },
    viewport,
  );
  // The clicked weather item, looked up in the current data so it disappears when its layer is off.
  const weatherEntry = useMemo<WeatherItem | null>(() => {
    if (!weatherPickId) return null;
    const adv = weather.advisories.find((a) => a.id === weatherPickId);
    if (adv && advisoriesOn) return { kind: "advisory", item: adv };
    const pirep = weather.pireps.find((p) => p.id === weatherPickId);
    if (pirep && pirepsOn) return { kind: "pirep", item: pirep };
    return null;
  }, [weatherPickId, weather.advisories, weather.pireps, advisoriesOn, pirepsOn]);

  const weatherNotice =
    weather.advisoryFailed && weather.pirepFailed
      ? "Some weather data could not be loaded."
      : weather.advisoryFailed
        ? "Some SIGMET and AIRMET data could not be loaded."
        : weather.pirepFailed
          ? "Pilot reports could not be loaded."
          : null;

  // Route line (Phase 8a): the same route lookup the aircraft panel uses, shared through the query cache.
  const routeCallsign = selected?.callsign ?? null;
  const routeQuery = useQuery({
    queryKey: ["route", routeCallsign],
    queryFn: () => getFlightRoute({ data: { callsign: routeCallsign! } }),
    enabled: routeOn && !!routeCallsign && routeCallsign.length >= 3,
    staleTime: 30 * 60 * 1000,
  });
  const airspace = useAirspace(
    { controlled: airspaceControlledOn, special: airspaceSpecialOn },
    viewport,
  );
  const routeAirspace = useMemo<RouteAirspaceState>(() => {
    const rt = routeQuery.data;
    const drawable = routeOn && !!selected && !!rt && isDrawableRoute(rt.origin, rt.destination);
    return {
      route:
        drawable && rt
          ? {
              origin: {
                lat: rt.origin.lat,
                lon: rt.origin.lon,
                label: rt.origin.iata ?? rt.origin.icao ?? "Origin",
              },
              destination: {
                lat: rt.destination.lat,
                lon: rt.destination.lon,
                label: rt.destination.iata ?? rt.destination.icao ?? "Destination",
              },
            }
          : null,
      airspace: airspace.areas,
    };
  }, [routeQuery.data, routeOn, selected, airspace.areas]);
  const airspaceEntry = useMemo(
    () => (airspacePickId ? (airspace.areas?.find((a) => a.id === airspacePickId) ?? null) : null),
    [airspacePickId, airspace.areas],
  );
  const airspaceNotice = airspace.tooWide
    ? "Zoom in to see airspace areas."
    : airspace.failed
      ? "Airspace data could not be loaded."
      : null;

  // Watchlist, recently viewed flights and alerts (Phase 5).
  const personal = usePersonalData(auth);
  // Stage of every watched flight (Phase 11a).
  const flightViews = useFlightStages({
    aircraft: feed.aircraft,
    watch: personal.watch,
    alertsOn,
    onShow: (hex) => onSelect(hex),
  });
  // Alert rules (Phase 10): conditions checked against every update, an area drawn on the map.
  const alertRules = useAlertRules({
    aircraft: feed.aircraft,
    enabled: alertsOn,
    onShow: (hex) => onSelect(hex),
  });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [parseNote, setParseNote] = useState<string[] | null>(null);
  const [areaPick, setAreaPick] = useState<{ center: [number, number] | null } | null>(null);
  const placeResolver = useMemo(
    () => (text: string) => resolvePlace(text, currentAirportList()),
    // The larger airport list replaces the short one when it has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rulesOpen],
  );
  useEffect(() => {
    if (rulesOpen) void loadLargeAirports().catch(() => undefined);
  }, [rulesOpen]);
  const saveRule = () => {
    const r = alertRules.add({ name: ruleDraft.name, conditions: ruleDraft.conditions });
    if (r === "added") {
      toast("Rule created");
      setRuleDraft(EMPTY_DRAFT);
      setParseNote(null);
    } else if (r === "full") toast.error("You have the most rules (20). Delete one first.");
    else toast.error("That rule is not valid. Check the altitudes.");
  };
  const onAreaPick = (p: [number, number]) => {
    if (!areaPick) return;
    if (!areaPick.center) {
      setAreaPick({ center: p });
      return;
    }
    const radius = Math.min(
      500,
      Math.max(
        1,
        distanceNm({ lat: areaPick.center[1], lon: areaPick.center[0] }, { lat: p[1], lon: p[0] }),
      ),
    );
    setRuleDraft((d) => ({
      ...d,
      conditions: {
        ...d.conditions,
        area: {
          lat: areaPick.center![1],
          lon: areaPick.center![0],
          radiusNm: Math.round(radius * 10) / 10,
          label: "drawn area",
        },
      },
    }));
    setAreaPick(null);
    setRulesOpen(true);
  };
  const alertAreas = useMemo<AlertAreaDrawing[]>(() => {
    const list: AlertAreaDrawing[] = alertRules.rules
      .filter((r) => r.enabled && r.conditions.area)
      .map((r) => ({ id: r.id, area: r.conditions.area! }));
    if (ruleDraft.conditions.area)
      list.push({ id: "draft", area: ruleDraft.conditions.area, preview: true });
    return list;
  }, [alertRules.rules, ruleDraft.conditions.area]);
  // Session replay (Phase 9a): record every update, play back on request.
  const replay = useReplay(feed.aircraft, feed.fetchedAt);
  useWatchAlerts({
    aircraft: feed.aircraft,
    watch: personal.watch,
    enabled: alertsOn,
    onShow: (hex) => onSelect(hex),
  });
  const selectedHexForRecent = selected?.hex ?? null;
  useEffect(() => {
    if (!selected || selected.hex.startsWith("mock-")) return;
    personal.addRecent({
      hex: selected.hex,
      callsign: selected.callsign,
      registration: selected.registration,
      type: selected.type,
    });
    // Only when a different aircraft is opened, not on every data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHexForRecent]);
  // The chase camera only makes sense while following.
  useEffect(() => {
    if (!follow) setChase(false);
  }, [follow]);
  const toggleWatch = (kind: "flight" | "aircraft" | "airport", key: string, label: string) => {
    const r = personal.toggleWatch(kind, key, label);
    if (r === "added") toast("Watching " + label);
    else if (r === "removed") toast("Stopped watching " + label);
    else if (r === "full") toast.error("The watchlist is full (50 items). Remove one first.");
  };
  const openWatchItem = (item: WatchItem) => {
    setWatchlistOpen(false);
    if (item.kind === "airport") {
      const ap = currentAirportList().find((a) => a.icao === item.key);
      if (ap) openAirport(ap);
      return;
    }
    if (item.kind === "aircraft") {
      onSelect(item.key);
      return;
    }
    const found = allAircraft.find((a) => watchMatches([item], a).length > 0);
    if (found) pickAircraft(found);
    else toast(item.label + " is not in the area the map has loaded right now.");
  };
  const openRecent = (r: RecentFlight) => {
    setWatchlistOpen(false);
    onSelect(r.hex);
  };

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
            showTrail={showTrail}
            receivedAt={feed.fetchedAt}
            presentHexes={presentHexes}
            smoothMotion={smoothMotion}
            chase={chase && follow}
            replay={replay.source}
            alertAreas={alertAreas}
            pickMode={!!areaPick}
            onPick={onAreaPick}
            onMotionDelay={setMotionDelaySec}
            onSelectedMotion={(hex, m) => setSelectedMotion({ hex, m })}
            weather={weather.state}
            onWeatherPick={setWeatherPickId}
            routeAirspace={routeAirspace}
            onAirspacePick={setAirspacePickId}
            rulerActive={rulerActive}
            rulerPoints={rulerPoints}
            onRulerPoint={(p) => setRulerPoints((pts) => nextRulerPoints(pts, p))}
          />
        </Suspense>
      </ClientOnly>

      {/* Top HUD */}
      <div
        ref={hudRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] md:flex-row md:flex-wrap md:items-start lg:flex-nowrap"
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
          <SearchBox aircraft={allAircraft} onAircraft={pickAircraft} onAirport={openAirport} />
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
              <ToggleGroupItem value="dark" className="max-md:h-10 max-md:min-w-10">
                Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="satellite" className="max-md:h-10 max-md:min-w-10">
                Sat
              </ToggleGroupItem>
              <ToggleGroupItem value="light" className="max-md:h-10 max-md:min-w-10">
                Light
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="glass-panel flex h-11 items-center rounded-md px-1">
            <Button
              variant="hud"
              size="sm"
              className="max-md:h-10 max-md:min-w-10"
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
              className="max-md:h-10 max-md:min-w-10"
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
          {/* On phones the units live in Settings; this saves a whole HUD row. */}
          <div className="glass-panel flex h-11 items-center rounded-md px-1 max-md:hidden">
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
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
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
              {/* In the popover, not the HUD row: that row has no spare width at ~1280 px. */}
              <Link
                to="/inspector"
                className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                <Radio className="size-4" />
                ADS-B message inspector
              </Link>
              {/* The dialog is rendered at page level: a dialog inside the popover would unmount with it. */}
              <button
                type="button"
                onClick={() => {
                  setFiltersOpen(false);
                  setCreditsOpen(true);
                }}
                className="mt-2 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                <Info className="size-4" />
                Credits and data sources
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Map tools: share link, my location, saved views */}
      <div
        className="pointer-events-none absolute left-[max(0.75rem,env(safe-area-inset-left))] z-10"
        style={{ top: "calc(var(--hud-h, 76px) + 8px)" }}
      >
        <MapTools
          view={currentView}
          onFly={flyTo}
          getShareUrl={getShareUrl}
          onLocated={showNearby}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenWatchlist={() => setWatchlistOpen(true)}
          watchCount={personal.watch.length}
          replay={{
            available: replay.available,
            active: !!replay.source,
            onStart: replay.start,
            onStop: replay.stop,
          }}
          layers={{
            terrain,
            onTerrain: setTerrain,
            showTrail,
            onShowTrail: setShowTrail,
            trail3d,
            onTrail3d: setTrail3d,
            glideRing,
            onGlideRing: setGlideRing,
            hasSelection: !!selected,
            weather: {
              radar: radarOn,
              onRadar: setRadarOn,
              echoTops: echoTopsOn,
              onEchoTops: setEchoTopsOn,
              advisories: advisoriesOn,
              onAdvisories: setAdvisoriesOn,
              pireps: pirepsOn,
              onPireps: setPirepsOn,
            },
            routeLine: routeOn,
            onRouteLine: setRouteOn,
            airspaceControlled: airspaceControlledOn,
            onAirspaceControlled: setAirspaceControlledOn,
            airspaceSpecial: airspaceSpecialOn,
            onAirspaceSpecial: setAirspaceSpecialOn,
          }}
          ruler={{
            active: rulerActive,
            onToggle: toggleRuler,
            summary: rulerSummary(rulerPoints, units),
            hasPoints: rulerPoints.length > 0,
            onClear: () => setRulerPoints([]),
          }}
        />
        {nearby && (
          <div className="mt-2">
            <NearbyAirports
              items={nearby}
              units={units}
              onPick={(a) => {
                openAirport(a);
              }}
              onClose={() => setNearby(null)}
            />
          </div>
        )}
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
          className={`pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 ${selected ? "hidden md:block" : ""}`}
        >
          <div className="mb-2 hidden md:block [@media(max-height:480px)]:hidden">
            <AircraftTypesLegend />
          </div>
          <AltitudeLegend units={units} />
        </div>
      }

      {selected && !replay.source && (
        <AircraftPanel
          key={selected.hex}
          aircraft={panelAircraft ?? selected}
          units={units}
          trail={feed.trail}
          trail3d={trail3d}
          onTrail3d={setTrail3d}
          follow={follow}
          onFollow={setFollow}
          chase={chase}
          onChase={setChase}
          watchControls={{
            aircraftOn: personal.isWatching("aircraft", selected.hex),
            flightOn: selected.callsign ? personal.isWatching("flight", selected.callsign) : null,
            flightLabel: selected.callsign,
            onToggleAircraft: () =>
              toggleWatch(
                "aircraft",
                selected.hex,
                selected.registration ?? selected.callsign ?? selected.hex.toUpperCase(),
              ),
            onToggleFlight: () =>
              selected.callsign && toggleWatch("flight", selected.callsign, selected.callsign),
          }}
          glideRing={glideRing}
          onGlideRing={setGlideRing}
          glideRatio={glideRatio}
          onGlideRatio={setGlideRatio}
          glideStatus={glideStatus}
          source={feed.source}
          onClose={() => onSelect(null)}
        />
      )}

      {(radarOn ||
        weatherEntry ||
        weatherNotice ||
        airspaceEntry ||
        airspaceNotice ||
        replay.source ||
        areaPick) && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-[max(5.5rem,env(safe-area-inset-bottom))] z-20 flex-col items-center gap-2 pl-14 pr-3 md:px-3 md:bottom-3 ${(selected || airport) && !replay.source ? "hidden xl:flex" : "flex"}`}
        >
          {weatherNotice && (
            <div className="glass-panel pointer-events-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground">
              {weatherNotice}
            </div>
          )}
          {airspaceNotice && (
            <div className="glass-panel pointer-events-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground">
              {airspaceNotice}
            </div>
          )}
          {airspaceEntry && (
            <AirspaceInfoCard area={airspaceEntry} onClose={() => setAirspacePickId(null)} />
          )}
          {weatherEntry && (
            <WeatherInfoCard entry={weatherEntry} onClose={() => setWeatherPickId(null)} />
          )}
          {areaPick && (
            <div
              role="status"
              className="glass-panel pointer-events-auto flex items-center gap-3 rounded-md px-3 py-2 text-sm"
            >
              <span>
                {areaPick.center
                  ? "Now click a point on the edge of the area."
                  : "Click the centre of the alert area."}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAreaPick(null);
                  setRulesOpen(true);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
          {replay.source && <ReplayBar replay={replay} />}
          {radarOn && <RadarTimeline radar={weather.radar} now={Date.now()} />}
        </div>
      )}

      {airport && !selected && !replay.source && (
        <AirportPanel
          key={airport.icao}
          airport={airport}
          aircraft={allAircraft}
          units={units}
          onClose={() => setAirport(null)}
          watching={personal.isWatching("airport", airport.icao)}
          onToggleWatch={() => toggleWatch("airport", airport.icao, airport.name)}
        />
      )}

      <CreditsDialog open={creditsOpen} onOpenChange={setCreditsOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <FirstRunGuide
        open={guideOpen}
        onClose={() => {
          setGuideOpen(false);
          writeFlagPref(STORAGE_KEYS.guideSeen, true);
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        units={units}
        onUnits={setUnits}
        basemap={basemap}
        onBasemap={setBasemap}
        terrain={terrain}
        onTerrain={setTerrain}
        showTrail={showTrail}
        onShowTrail={setShowTrail}
        trail3d={trail3d}
        onTrail3d={setTrail3d}
        batterySaver={batterySaver}
        smoothMotion={smoothMotion}
        onSmoothMotion={setSmoothMotion}
        motionDelaySec={motionDelaySec}
        onBatterySaver={setBatterySaver}
        shortcutsOn={shortcutsOn}
        onShortcutsOn={setShortcutsOn}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenCredits={() => setCreditsOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
      />
      <WatchlistDialog
        open={watchlistOpen}
        onOpenChange={setWatchlistOpen}
        watch={personal.watch}
        recent={personal.recent}
        aircraft={allAircraft}
        units={units}
        alertsOn={alertsOn}
        onAlertsOn={setAlertsOn}
        sync={personal.sync}
        signedIn={auth.status === "signed-in"}
        onOpenWatch={openWatchItem}
        onRemoveWatch={(w) => personal.removeWatchItem(w.kind, w.key)}
        onOpenRecent={openRecent}
        onClearRecent={personal.clearRecent}
        onOpenAccount={() => {
          setWatchlistOpen(false);
          setAccountEverOpened(true);
          setAccountOpen(true);
        }}
        onOpenRules={() => {
          setWatchlistOpen(false);
          setRulesOpen(true);
        }}
        ruleCount={alertRules.rules.length}
        flightViews={flightViews}
        onAddFlight={(text) => {
          const key = normalizeKey("flight", text);
          if (key.length < 3 || key.length > 10)
            return "A flight number has 3 to 10 letters and digits, for example UAL123.";
          if (personal.isWatching("flight", key)) return key + " is already on your list.";
          const r = personal.toggleWatch("flight", key, key);
          if (r === "full") return "The watchlist is full (50 items). Remove one first.";
          return r === "added" ? null : "That is not a valid flight number.";
        }}
      />
      <AlertRulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={alertRules.rules}
        aircraft={allAircraft}
        draft={ruleDraft}
        onDraft={setRuleDraft}
        resolvePlace={placeResolver}
        onSave={saveRule}
        onRemove={alertRules.remove}
        onToggle={alertRules.setEnabled}
        onDrawArea={() => {
          setRulesOpen(false);
          setAreaPick({ center: null });
        }}
        alertsOn={alertsOn}
        parseNote={parseNote}
        onParseNote={setParseNote}
      />
      <AccountDialog
        open={accountOpen}
        onOpenChange={(v) => {
          if (v) setAccountEverOpened(true);
          setAccountOpen(v);
        }}
        auth={auth}
      />
    </main>
  );
}
