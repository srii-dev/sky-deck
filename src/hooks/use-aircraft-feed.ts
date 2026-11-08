import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { getAircraftFeed, searchAircraft } from "@/lib/adsb.functions";
import {
  isEmergency,
  nextEmergencyMemory,
  presentEmergency,
  pickFresherAircraft,
  lastGoodUsable,
  resolveFeedNotices,
  type Aircraft,
  type EmergencyMemory,
  type FeedResponse,
} from "@/lib/aircraft";
import { planCoverage, wideCircleDue, type Circle } from "@/lib/coverage";
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
  error: string | null;
  backup: boolean;
  areasMissing: boolean;
  partial: boolean;
}

type CacheEntry = { at: number; res: FeedResponse };

/** Results reused from cache are aged so dead-reckoning stays correct. */
function aged(entry: CacheEntry, now: number): Aircraft[] {
  const ageS = Math.max(0, (now - entry.at) / 1000);
  return ageS < 0.5
    ? entry.res.aircraft
    : entry.res.aircraft.map((a) => ({ ...a, seenPos: a.seenPos + ageS }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Incoming {
  aircraft: Aircraft[];
  source: string;
  fresh: boolean;
}

export interface MergedAircraft {
  aircraft: Aircraft;
  fresh: boolean;
}

async function refreshCoverage(
  vp: Viewport,
  cache: Map<string, CacheEntry>,
  gapMs: number | null,
  pollIndex: number,
): Promise<FeedState & { ok: boolean; merged: MergedAircraft[] }> {
  const started = performance.now();
  const plan = planCoverage(vp);
  const now = Date.now();
  const lists: Incoming[] = [];
  const sources = new Set<string>();
  let failed = 0;
  let cached = 0;
  let fallbackBusy = false;

  const todo: Circle[] = [];
  plan.circles.forEach((c, index) => {
    const hit = cache.get(c.key);
    const serveCache = () => {
      if (!hit) return;
      if (hit.res.busy) fallbackBusy = true;
      lists.push({ aircraft: aged(hit, now), source: hit.res.source, fresh: false });
      sources.add(hit.res.source);
      cached++;
    };
    if (hit && now - hit.at < CIRCLE_TTL_MS) {
      serveCache();
      return;
    }
    // Wide views only: far circles alternate. A skip is not a failure and still merges aged
    // positions. Zoomed-in tiles are few and small, so every one is fetched each poll.
    if (plan.tier === "wide" && !wideCircleDue(index, !!hit, pollIndex)) {
      serveCache();
      return;
    }
    todo.push(c);
  });

  let next = 0;
  const worker = async (slot: number) => {
    await sleep(slot * STAGGER_MS);
    while (next < todo.length) {
      const c = todo[next++]!;
      let res: FeedResponse | null = null;
      let failure = "";
      try {
        res = await getAircraftFeed({ data: { lat: c.lat, lon: c.lon, radiusNm: c.radiusNm } });
      } catch (err) {
        res = null;
        failure = err instanceof Error ? err.message : "request failed";
      }
      if (res && !res.error) {
        if (res.busy) fallbackBusy = true;
        cache.set(c.key, { at: Date.now(), res });
        lists.push({ aircraft: res.aircraft, source: res.source, fresh: true });
        sources.add(res.source);
      } else {
        failed++;
        const message = res?.error || failure || "request failed";
        if (import.meta.env.DEV) {
          console.info(`[feed] circle ${c.key} failed: ${message}`);
        }
        const old = cache.get(c.key);
        if (old && Date.now() - old.at < CIRCLE_STALE_OK_MS) {
          lists.push({ aircraft: aged(old, Date.now()), source: old.res.source, fresh: false });
        } else if (res?.aircraft.length) {
          lists.push({ aircraft: res.aircraft, source: res.source, fresh: false });
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, todo.length) }, (_, i) => worker(i)),
  );

  // Merge and de-duplicate by ICAO hex, keeping the whole freshest record.
  const byHex = new Map<string, MergedAircraft>();
  for (const list of lists) {
    for (const a of list.aircraft) {
      const stamped = { ...a, source: list.source };
      const prev = byHex.get(a.hex);
      if (!prev || pickFresherAircraft(prev.aircraft, stamped) !== prev.aircraft) {
        byHex.set(a.hex, { aircraft: stamped, fresh: list.fresh });
      }
    }
  }
  for (const [k, v] of cache) if (Date.now() - v.at > 2 * CIRCLE_STALE_OK_MS) cache.delete(k);

  const ms = Math.round(performance.now() - started);
  const source = [...sources].join(", ") || null;
  const gap = gapMs == null ? "n/a" : `${Math.round(gapMs)} ms`;
  if (import.meta.env.DEV) {
    console.info(
      `[feed] refresh: ${todo.length} request(s), ${cached} cached, ${failed} failed, ` +
        `${plan.circles.length}/${plan.totalNeeded} circle(s), ${ms} ms, gap: ${gap}, source: ${source ?? "none"}, ${byHex.size} aircraft`,
    );
  }

  const merged = [...byHex.values()];
  const notices = resolveFeedNotices({ circles: plan.circles.length, failed, fallbackBusy });
  return {
    aircraft: merged.map((m) => m.aircraft),
    merged,
    source,
    fetchedAt: failed === plan.circles.length ? null : Date.now(),
    error: notices.error,
    backup: notices.backup,
    areasMissing: notices.areasMissing,
    partial: plan.partial,
    ok: failed === 0,
  };
}

export function useAircraftFeed(viewport: Viewport | null, selectedHex: string | null) {
  const [state, setState] = useState<FeedState>({
    aircraft: [],
    source: null,
    fetchedAt: null,
    error: null,
    backup: false,
    areasMissing: false,
    partial: false,
  });
  const [isFetching, setIsFetching] = useState(false);

  const vpRef = useRef(viewport);
  vpRef.current = viewport;
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const wakeRef = useRef<(() => void) | null>(null);
  const dirtyRef = useRef(false);
  const failuresRef = useRef(0);
  const emergencyRef = useRef<EmergencyMemory>({});
  const loggedEmergencyRef = useRef(new Set<string>());

  // One refresh at a time. A successful next start is aimed at POLL_MS after the previous start.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStart = 0;
    let pollIndex = 0;
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
          const r = await refreshCoverage(vp, cacheRef.current, gapMs, pollIndex);
          pollIndex += 1;
          elapsed = performance.now() - startedAt;
          if (cancelled) break;
          setIsFetching(false);
          failuresRef.current = r.ok ? 0 : failuresRef.current + 1;
          let aircraft = r.aircraft;
          if (r.fetchedAt != null) {
            const observedAt = Date.now();
            emergencyRef.current = nextEmergencyMemory(
              emergencyRef.current,
              r.merged.map((m) => ({
                hex: m.aircraft.hex,
                squawk: m.aircraft.squawk,
                seenPos: m.aircraft.seenPos,
                freshlyFetched: m.fresh,
                observedAt,
              })),
            );
            for (const m of r.merged) {
              const a = m.aircraft;
              if (!a.squawk || !isEmergency(a.squawk)) continue;
              const key = `${a.hex}:${a.squawk}`;
              if (loggedEmergencyRef.current.has(key)) continue;
              loggedEmergencyRef.current.add(key);
              if (import.meta.env.DEV) {
                console.info(
                  `[emergency] hex=${a.hex} callsign=${a.callsign ?? ""} squawk=${a.squawk} source=${a.source ?? ""} seenPos=${a.seenPos} at=${new Date(observedAt).toISOString()}`,
                );
              }
            }
            aircraft = r.merged.map((m) => presentEmergency(m.aircraft, emergencyRef.current));
          }
          setState((prev) => ({
            // Every provider failed: keep the last good aircraft for a while, then clear them.
            aircraft:
              r.fetchedAt == null && prev.aircraft.length
                ? lastGoodUsable(prev.fetchedAt == null ? null : Date.now() - prev.fetchedAt)
                  ? prev.aircraft
                  : []
                : aircraft,
            source: r.source ?? prev.source,
            fetchedAt: r.fetchedAt ?? prev.fetchedAt,
            error: r.error,
            backup: r.backup,
            areasMissing: r.areasMissing,
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
  const vpKey = viewport
    ? planCoverage(viewport)
        .circles.map((c) => c.key)
        .join("|")
    : "";
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
    return extra ? [...list, presentEmergency(extra, emergencyRef.current)] : list;
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
        pts.push({
          lat: a.lat,
          lon: a.lon,
          altFt: a.altFt,
          onGround: a.onGround,
          t: now,
          gs: a.gs,
          vRate: a.vRate,
        });
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
    error: state.error,
    backup: state.backup,
    areasMissing: state.areasMissing,
    partial: state.partial,
    isFetching,
  };
}
