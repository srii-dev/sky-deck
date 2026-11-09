import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Aircraft, FlightRoute } from "@/lib/aircraft";
import { getFlightRoute } from "@/lib/adsb.functions";
import {
  currentStage,
  inferStage,
  isNotableChange,
  loadTracks,
  recordStage,
  STAGE_MESSAGES,
  storeTracks,
  type FlightTrack,
  type StageChange,
  type StageResult,
} from "@/lib/flight-stage";
import type { WatchItem } from "@/lib/watchlist";

/*
 * Stage of every watched flight (Phase 11a): at the gate, taxiing, taking off, climbing, cruising, descending, on
 * approach, landing, arrived. It looks at each aircraft update while the page is open, so a flight that is not in
 * the area the map loaded shows no stage. Changes are remembered in this browser, so the timeline survives a reload.
 */

export interface FlightView {
  callsign: string;
  aircraft: Aircraft | null;
  result: StageResult | null;
  route: FlightRoute | null | undefined;
  changes: StageChange[];
}

export function useFlightStages(opts: {
  aircraft: readonly Aircraft[];
  watch: readonly WatchItem[];
  alertsOn: boolean;
  onShow: (hex: string) => void;
}): Record<string, FlightView> {
  const { aircraft, watch, alertsOn, onShow } = opts;
  const flights = useMemo(
    () => watch.filter((w) => w.kind === "flight").map((w) => w.key),
    [watch],
  );
  const [tracks, setTracks] = useState<Record<string, FlightTrack>>({});
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  // This browser's saved timelines, read after the first render.
  useEffect(() => setTracks(loadTracks()), []);

  const routeQueries = useQueries({
    queries: flights.map((cs) => ({
      queryKey: ["route", cs],
      queryFn: () => getFlightRoute({ data: { callsign: cs } }),
      staleTime: 30 * 60 * 1000,
    })),
  });
  const routes = useMemo(() => {
    const m = new Map<string, FlightRoute | null | undefined>();
    flights.forEach((cs, i) => m.set(cs, routeQueries[i]?.data));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, ...routeQueries.map((q) => q.data)]);

  // The aircraft currently in view for each watched flight number.
  const inView = useMemo(() => {
    const m = new Map<string, Aircraft>();
    for (const a of aircraft) {
      const cs = a.callsign?.trim().toUpperCase();
      if (cs && flights.includes(cs) && !m.has(cs) && a.seenPos < 60) m.set(cs, a);
    }
    return m;
  }, [aircraft, flights]);

  // Remember stage changes (and tell the visitor about the notable ones).
  useEffect(() => {
    let next = tracksRef.current;
    let changed = false;
    for (const [cs, a] of inView) {
      const route = routes.get(cs);
      const prevTrack = next[cs];
      const prev = currentStage(prevTrack);
      const r = inferStage(
        a,
        route ? { origin: route.origin, destination: route.destination } : null,
        prev,
      );
      const updated = recordStage(prevTrack, r.stage, Date.now());
      if (updated !== prevTrack) {
        next = { ...next, [cs]: updated };
        changed = true;
        if (alertsOn && isNotableChange(prev, r.stage)) {
          const msg = STAGE_MESSAGES[r.stage];
          if (msg) {
            toast(cs + " " + msg, {
              action: { label: "Show", onClick: () => onShowRef.current(a.hex) },
              duration: 8000,
            });
          }
        }
      }
    }
    if (changed) {
      setTracks(next);
      storeTracks(next);
    }
  }, [inView, routes, alertsOn]);

  return useMemo(() => {
    const out: Record<string, FlightView> = {};
    for (const cs of flights) {
      const a = inView.get(cs) ?? null;
      const route = routes.get(cs);
      out[cs] = {
        callsign: cs,
        aircraft: a,
        result: a
          ? inferStage(
              a,
              route ? { origin: route.origin, destination: route.destination } : null,
              currentStage(tracks[cs]),
            )
          : null,
        route,
        changes: tracks[cs]?.changes ?? [],
      };
    }
    return out;
  }, [flights, inView, routes, tracks]);
}
