import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import type { Aircraft } from "@/lib/aircraft";
import { currentAirportList, isLargeLoaded, loadLargeAirports } from "@/lib/airport-list";
import {
  detectWatchEvents,
  newAlertState,
  type AirportPoint,
  type AlertState,
} from "@/lib/watch-alerts";
import type { WatchItem } from "@/lib/watchlist";

/*
 * Shows an in-app message when a watched flight, airframe or airport has a takeoff, a landing or an emergency
 * squawk (Phase 5b). It looks at every aircraft update while the page is open; it does not run in the background
 * and asks for no browser permission.
 */

export function useWatchAlerts(opts: {
  aircraft: readonly Aircraft[];
  watch: readonly WatchItem[];
  enabled: boolean;
  onShow: (hex: string) => void;
}) {
  const { aircraft, watch, enabled, onShow } = opts;
  const stateRef = useRef<AlertState>(newAlertState());
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  const airportKeys = useMemo(
    () => watch.filter((w) => w.kind === "airport").map((w) => w.key),
    [watch],
  );
  // The larger airport list holds more airports than the short built-in one: load it when one is watched.
  useEffect(() => {
    if (airportKeys.length > 0 && !isLargeLoaded()) void loadLargeAirports().catch(() => undefined);
  }, [airportKeys.length]);

  useEffect(() => {
    if (!enabled || watch.length === 0) {
      stateRef.current = newAlertState();
      return;
    }
    const airports: AirportPoint[] = [];
    for (const key of airportKeys) {
      const ap = currentAirportList().find((a) => a.icao === key);
      if (ap) airports.push({ icao: ap.icao, name: ap.iata || ap.icao, lat: ap.lat, lon: ap.lon });
    }
    const r = detectWatchEvents(stateRef.current, aircraft, { watch, airports, now: Date.now() });
    stateRef.current = r.state;
    for (const e of r.events) {
      const show = { label: "Show", onClick: () => onShowRef.current(e.hex) };
      if (e.kind === "emergency")
        toast.error(e.title, { description: e.detail, action: show, duration: 15_000 });
      else toast(e.title, { description: e.detail, action: show, duration: 8000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, enabled]);
}
