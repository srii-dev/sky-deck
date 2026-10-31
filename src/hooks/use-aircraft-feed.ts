import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { getAircraftFeed, searchAircraft } from "@/lib/adsb.functions";
import type { Aircraft } from "@/lib/aircraft";
import type { TrailPoint, Viewport } from "@/components/skydeck/map-config";

export const POLL_MS = 7000;
const MAX_TRAIL_POINTS = 600;
const FORGET_AFTER_MS = 15 * 60 * 1000;

export function useAircraftFeed(viewport: Viewport | null, selectedHex: string | null) {
  const vp = viewport
    ? {
        lat: Math.round(viewport.lat * 100) / 100,
        lon: Math.round(viewport.lon * 100) / 100,
        radiusNm: Math.round(viewport.radiusNm),
      }
    : null;

  const feed = useQuery({
    queryKey: ["feed", vp?.lat, vp?.lon, vp?.radiusNm],
    queryFn: () => getAircraftFeed({ data: vp! }),
    enabled: !!vp,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    staleTime: POLL_MS - 1000,
  });

  const inFeed = !!selectedHex && !!feed.data?.aircraft.some((a) => a.hex === selectedHex);
  const selectedQuery = useQuery({
    queryKey: ["aircraft-hex", selectedHex],
    queryFn: () => searchAircraft({ data: { q: selectedHex! } }),
    enabled: !!selectedHex && !!feed.data && !inFeed,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
  });

  const aircraft = useMemo<Aircraft[]>(() => {
    const list = feed.data?.aircraft ?? [];
    if (!selectedHex || inFeed) return list;
    const extra = selectedQuery.data?.aircraft.find((a) => a.hex === selectedHex);
    return extra ? [...list, extra] : list;
  }, [feed.data, selectedHex, inFeed, selectedQuery.data]);

  // Position history for trails, accumulated from every poll.
  const historyRef = useRef(new Map<string, TrailPoint[]>());
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const h = historyRef.current;
    for (const a of aircraft) {
      const pts = h.get(a.hex) ?? [];
      const last = pts[pts.length - 1];
      if (!last || Math.abs(last.lat - a.lat) > 1e-5 || Math.abs(last.lon - a.lon) > 1e-5) {
        pts.push({ lat: a.lat, lon: a.lon, altFt: a.altFt, onGround: a.onGround, t: now });
        if (pts.length > MAX_TRAIL_POINTS) pts.splice(0, pts.length - MAX_TRAIL_POINTS);
        h.set(a.hex, pts);
      }
    }
    for (const [hex, pts] of h) {
      if (now - pts[pts.length - 1].t > FORGET_AFTER_MS) h.delete(hex);
    }
    setHistoryVersion((v) => v + 1);
  }, [aircraft]);

  const trail = useMemo(
    () => (selectedHex ? [...(historyRef.current.get(selectedHex) ?? [])] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedHex, historyVersion],
  );

  return {
    aircraft,
    trail,
    fetchedAt: feed.data?.fetchedAt ?? null,
    source: feed.data?.source ?? null,
    error: feed.data?.error ?? (feed.isError ? "Couldn't reach live data" : null),
    isFetching: feed.isFetching,
  };
}
