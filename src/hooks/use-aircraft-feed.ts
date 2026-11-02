import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { getAircraftFeed, searchAircraft } from "@/lib/adsb.functions";
import type { Aircraft, FeedResponse } from "@/lib/aircraft";
import { planCoverage, type Circle } from "@/lib/coverage";
import type { TrailPoint, Viewport } from "@/components/skydeck/map-config";

export const POLL_MS = 7000;
/** Floor between a slow refresh finishing and the next start, so a long fetch cannot spin. */
const MIN_GAP_MS = 1000;
const MAX_TRAIL_POINTS = 600;
const FORGET_AFTER_MS = 15 * 60 * 1000;

/** Coverage fetch tuning: each circle is its own server call. */
const CONCURRENCY = 3;
const STAGGER_MS = 150;
const CIRCLE_TTL_MS = 5000;
/** A failed circle may reuse its last good result up to this age. */
const CIRCLE_STALE_OK_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;

interface FeedState {
  aircraft: Aircraft[];
  source: string | null;
  fetchedAt: number | null;
  busy: boolean;
  partial: boolean;
}

type CacheEntry = { at: number; res: FeedResponse };

/** Results reused from cache are aged so dead-reckoning stays correct. */
function aged(entry: CacheEntry, now: number): Aircraft[] {
  const ageS = Math.max(0, (now - entry.at) / 1000);
  return ageS < 0.5 ? entry.res.aircraft : entry.res.aircraft.map((a) => ({ ...a, seenPos: a.seenPos + ageS }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function refreshCoverage(
  vp: Viewport,
  cache: Map<string, CacheEntry>,
  gapMs: number | null,
): Promise<FeedState & { ok: boolean }> {
  const started = performance.now();
  const plan = planCoverage(vp);
  const now = Date.now();
  const lists: Aircraft[][] = [];
  const sources = new Set<string>();
  let failed = 0;
  let cached = 0;

  const todo: Circle[] = [];
  for (const c of plan.circles) {
    const hit = cache.get(c.key);
    if (hit && now - hit.at < CIRCLE_TTL_MS) {
      lists.push(aged(hit, now));
      sources.add(hit.res.source);
      cached++;
    } else todo.push(c);
  }

  let next = 0;
  const worker = async (slot: number) => {
    await sleep(slot * STAGGER_MS);
    while (next < todo.length) {
      const c = todo[next++]!;
      let res: FeedResponse | null = null;
      try {
        res = await getAircraftFeed({ data: { lat: c.lat, lon: c.lon, radiusNm: c.radiusNm } });
      } catch {
        res = null;
      }
      if (res && !res.error) {
        cache.set(c.key, { at: Date.now(), res });
        lists.push(res.aircraft);
        sources.add(res.source);
      } else {
        failed++;
        const old = cache.get(c.key);
        if (old && Date.now() - old.at < CIRCLE_STALE_OK_MS) lists.push(aged(old, Date.now()));
        else if (res?.aircraft.length) lists.push(res.aircraft);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, (_, i) => worker(i)));

  // Merge and de-duplicate by ICAO hex, keeping the freshest position.
  const byHex = new Map<string, Aircraft>();
  for (const list of lists) {
    for (const a of list) {
      const prev = byHex.get(a.hex);
      if (!prev || a.seenPos < prev.seenPos) byHex.set(a.hex, a);
    }
  }
  for (const [k, v] of cache) if (Date.now() - v.at > 2 * CIRCLE_STALE_OK_MS) cache.delete(k);

  const ms = Math.round(performance.now() - started);
  const source = [...sources].join(", ") || null;
  const gap = gapMs == null ? "n/a" : `${Math.round(gapMs)} ms`;
  console.info(
    `[feed] refresh: ${todo.length} request(s), ${cached} cached, ${failed} failed, ` +
      `${plan.circles.length}/${plan.totalNeeded} circle(s), ${ms} ms, gap: ${gap}, source: ${source ?? "none"}, ${byHex.size} aircraft`,
  );

  return {
    aircraft: [...byHex.values()],
    source,
    fetchedAt: failed === plan.circles.length ? null : Date.now(),
    busy: failed > 0,
    partial: plan.partial,
    ok: failed === 0,
  };
}

export function useAircraftFeed(viewport: Viewport | null, selectedHex: string | null) {
  const [state, setState] = useState<FeedState>({
    aircraft: [],
    source: null,
    fetchedAt: null,
    busy: false,
    partial: false,
  });
  const [isFetching, setIsFetching] = useState(false);

  const vpRef = useRef(viewport);
  vpRef.current = viewport;
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const wakeRef = useRef<(() => void) | null>(null);
  const dirtyRef = useRef(false);
  const failuresRef = useRef(0);

  // One refresh at a time. A successful next start is aimed at POLL_MS after the previous start.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStart = 0;
    (async () => {
      while (!cancelled) {
        const vp = vpRef.current;
        let didRefresh = false;
        let elapsed = 0;
        if (vp && !document.hidden) {
          const startedAt = performance.now();
          const gapMs = lastStart ? startedAt - lastStart : null;
          lastStart = startedAt;
          dirtyRef.current = false;
          didRefresh = true;
          setIsFetching(true);
          const r = await refreshCoverage(vp, cacheRef.current, gapMs);
          elapsed = performance.now() - startedAt;
          if (cancelled) break;
          setIsFetching(false);
          failuresRef.current = r.ok ? 0 : failuresRef.current + 1;
          setState((prev) => ({
            aircraft: r.fetchedAt == null && prev.aircraft.length ? prev.aircraft : r.aircraft,
            source: r.source ?? prev.source,
            fetchedAt: r.fetchedAt ?? prev.fetchedAt,
            busy: r.busy,
            partial: r.partial,
          }));
          if (dirtyRef.current && failuresRef.current === 0) continue;
        }
        const f = failuresRef.current;
        const delay = f
          ? Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** f)
          : didRefresh
            ? Math.max(MIN_GAP_MS, POLL_MS - elapsed)
            : POLL_MS;
        await new Promise<void>((res) => {
          timer = setTimeout(res, delay);
          wakeRef.current = () => {
            clearTimeout(timer);
            res();
          };
        });
        wakeRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      wakeRef.current?.();
    };
  }, []);

  // A new viewport refreshes right away (unless we're backing off a busy provider).
  const vpKey = viewport ? planCoverage(viewport).circles.map((c) => c.key).join("|") : "";
  useEffect(() => {
    if (!vpKey) return;
    dirtyRef.current = true;
    if (failuresRef.current === 0) wakeRef.current?.();
  }, [vpKey]);

  const hasFeed = state.fetchedAt != null;
  const inFeed = !!selectedHex && state.aircraft.some((a) => a.hex === selectedHex);
  const selectedQuery = useQuery({
    queryKey: ["aircraft-hex", selectedHex],
    queryFn: () => searchAircraft({ data: { q: selectedHex! } }),
    enabled: !!selectedHex && hasFeed && !inFeed,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
  });

  const aircraft = useMemo<Aircraft[]>(() => {
    const list = state.aircraft;
    if (!selectedHex || inFeed) return list;
    const extra = selectedQuery.data?.aircraft.find((a) => a.hex === selectedHex);
    return extra ? [...list, extra] : list;
  }, [state.aircraft, selectedHex, inFeed, selectedQuery.data]);

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
      const lastPt = pts[pts.length - 1];
      if (!lastPt || now - lastPt.t > FORGET_AFTER_MS) h.delete(hex);
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
    fetchedAt: state.fetchedAt,
    source: state.source,
    error: state.busy ? "Data provider busy" : null,
    partial: state.partial,
    isFetching,
  };
}
