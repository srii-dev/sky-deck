import { DATA_BUSY_MESSAGE, type Aircraft, type FeedResponse } from "./aircraft";
import { classifyAircraft } from "./aircraft-kind";
import {
  coalesce,
  defaultSleep,
  pacingWait,
  prune,
  reserveSlot,
  resetInflight,
  resetPacing,
  type CacheEntry,
  type Sleep,
} from "./request-control";

/*
 * Plain fetch + back-off for the free ADS-B proxies.
 * Server functions in adsb.functions.ts are the only callers besides tests.
 * The browser must not import this module.
 *
 * Request flow for the map feed (loadFeedCached):
 *   fresh cache hit -> return;  same key already in flight -> share that request;
 *   otherwise loadFeedCircle: per provider, skip if cooling down, wait for a pacing slot
 *   (PROVIDER_MIN_GAP_MS), re-check the cool-down, then fetch with the time that is left.
 * Coalescing, pacing and the in-flight map live in module memory, so they apply only inside
 * one server instance (one Workers isolate), not across instances.
 */

const UA = "SkyDeck/0.1 (community flight tracker)";
export const READSB_TIMEOUT_MS = 4000;
export const FEED_DEADLINE_MS = 9000;
const MIN_ATTEMPT_MS = 250;

const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 120_000;
const sourceBackoff = new Map<string, { until: number; strikes: number }>();

/**
 * Minimum gap between the STARTS of two upstream requests to the same provider (ms).
 * Applies to every real upstream request in this server instance (map feed and search).
 * Cache hits, coalesced waiters and providers skipped for cool-down use no slot.
 * These are starting guesses, not published limits (data-terms review is a separate task):
 *  - adsb.lol: limit unpublished ("dynamic"); 500 ms keeps a 6-circle poll near 3-4 s.
 *  - airplanes.live: documents about 1 request per second.
 *
 * OpenSky Network is deliberately NOT a source. Its terms of use (opensky-network.org/about/terms-of-use)
 * say the REST API is for non-profit research and education only, and that operational use in any live
 * product, service or automated system needs a written license. Add it back only with that license.
 */
export const PROVIDER_MIN_GAP_MS: Record<string, number> = {
  "adsb.lol": 500,
  "airplanes.live": 1000,
};

const FEED_TTL_MS = 5000;
/** A cached tile older than this is never served, even when the providers are failing. */
export const STALE_MAX_MS = 30_000;
/**
 * When the first usable provider's pacing queue is longer than this, a cached tile (at most
 * STALE_MAX_MS old) is served instead of queueing a request that would probably time out.
 */
export const SHED_WAIT_MS = 1500;
/** Provider order used by loadFeedCircle. Keep in sync with it. */
const FEED_PROVIDER_ORDER = ["adsb.lol", "airplanes.live"] as const;

export interface FeedStats {
  /** Answered from a fresh cache entry. */
  hits: number;
  /** No fresh entry: went on to fetch or to share a running fetch. */
  misses: number;
  /** Misses that waited for another caller's running fetch. */
  shared: number;
  /** Answered from an older cache entry to avoid waiting on a busy provider. */
  shed: number;
  /** Real upstream fetches started. */
  upstream: number;
  /** A failed fetch answered from an older cache entry (at most STALE_MAX_MS old). */
  staleOnError: number;
}
const freshStats = (): FeedStats => ({
  hits: 0,
  misses: 0,
  shared: 0,
  shed: 0,
  upstream: 0,
  staleOnError: 0,
});
let feedStats = freshStats();
/** Counters for this server instance only (for load tests and logs). */
export function getFeedStats(): FeedStats {
  return { ...feedStats };
}
/** A waiter gives up this long after the feed deadline if the shared request never settles. */
const WAITER_MARGIN_MS = 500;
const feedCache = new Map<string, CacheEntry<FeedResponse>>();

export function resetAdsbSourceState() {
  sourceBackoff.clear();
  feedCache.clear();
  feedStats = freshStats();
  resetInflight();
  resetPacing();
}

function coolingDown(name: string, now: number): boolean {
  const b = sourceBackoff.get(name);
  return !!b && now < b.until;
}

function strike(name: string, rateLimited: boolean, now: number) {
  const prev = sourceBackoff.get(name);
  const strikes = (prev?.strikes ?? 0) + 1;
  // Plain errors back off gently; 429s back off hard.
  const base = rateLimited ? BACKOFF_BASE_MS : BACKOFF_BASE_MS / 4;
  const wait = Math.min(BACKOFF_MAX_MS, base * 2 ** (strikes - 1));
  sourceBackoff.set(name, { until: now + wait, strikes });
}

export interface SourceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  readsbTimeoutMs?: number;
  deadlineMs?: number;
  /** Test hook: replaces every provider's pacing gap (0 turns pacing off). */
  paceGapMs?: number;
  /** Test hook: replaces the real timer used to wait for a pacing slot. */
  sleep?: Sleep;
}

/**
 * Wait for this provider's next start slot. The wait counts toward the caller's deadline.
 * Returns false (and reserves nothing) when the wait would leave less than MIN_ATTEMPT_MS,
 * so the caller skips this provider. Reserving is synchronous; only the sleep is async.
 */
async function takeSlot(
  name: string,
  remainingMs: number,
  clock: () => number,
  deps?: SourceDeps,
): Promise<boolean> {
  const gap = deps?.paceGapMs ?? PROVIDER_MIN_GAP_MS[name] ?? 0;
  if (gap <= 0) return true;
  if (pacingWait(name, clock()) + MIN_ATTEMPT_MS > remainingMs) return false;
  const wait = reserveSlot(name, gap, clock());
  if (wait > 0) await (deps?.sleep ?? defaultSleep)(wait);
  return true;
}

export async function getJson(url: string, timeoutMs = 6000, deps?: SourceDeps): Promise<unknown> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};

type RawKeys =
  | "alt_baro"
  | "alt_geom"
  | "baro_rate"
  | "category"
  | "desc"
  | "flight"
  | "geom_rate"
  | "gs"
  | "hex"
  | "lat"
  | "lon"
  | "mag_heading"
  | "r"
  | "seen"
  | "seen_pos"
  | "squawk"
  | "t"
  | "track"
  | "true_heading"
  | "ownOp";
type Raw = Partial<Record<RawKeys, unknown>>;

function fromReadsb(ac: Raw): Aircraft | null {
  const lat = num(ac.lat);
  const lon = num(ac.lon);
  if (lat == null || lon == null) return null;
  const onGround = ac.alt_baro === "ground";
  const altFt = onGround ? 0 : (num(ac.alt_baro) ?? num(ac.alt_geom));
  const category = str(ac.category);
  const type = str(ac.t);
  const k = classifyAircraft(category, type);
  return {
    hex: String(ac.hex ?? "")
      .replace("~", "")
      .toLowerCase(),
    callsign: str(ac.flight),
    registration: str(ac.r),
    type,
    description: str(ac.desc),
    operator: str(ac.ownOp),
    lat,
    lon,
    altFt,
    onGround,
    gs: num(ac.gs),
    track: num(ac.track) ?? num(ac.true_heading) ?? num(ac.mag_heading),
    vRate: num(ac.baro_rate) ?? num(ac.geom_rate),
    squawk: str(ac.squawk),
    category,
    kind: k.kind,
    kindLabel: k.label,
    seenPos: num(ac.seen_pos) ?? num(ac.seen) ?? 0,
  };
}

function parseReadsb(json: unknown): Aircraft[] {
  const list =
    (json as { ac?: unknown[]; aircraft?: unknown[] })?.ac ??
    (json as { aircraft?: unknown[] })?.aircraft ??
    [];
  const out: Aircraft[] = [];
  for (const raw of list) {
    const a = fromReadsb(raw as Raw);
    if (a && a.hex) out.push(a);
  }
  return out;
}

export async function loadFeedCircle(
  lat: number,
  lon: number,
  radiusNm: number,
  deps?: SourceDeps,
): Promise<FeedResponse> {
  const clock = deps?.now ?? Date.now;
  const started = clock();
  const deadline = deps?.deadlineMs ?? FEED_DEADLINE_MS;
  const readsbTimeout = deps?.readsbTimeoutMs ?? READSB_TIMEOUT_MS;
  const r = radiusNm;

  const sources: [string, number, (timeoutMs: number) => Promise<Aircraft[]>][] = [
    [
      "adsb.lol",
      readsbTimeout,
      (timeoutMs) =>
        getJson(`https://api.adsb.lol/v2/point/${lat}/${lon}/${r}`, timeoutMs, deps).then(
          parseReadsb,
        ),
    ],
    [
      "airplanes.live",
      readsbTimeout,
      (timeoutMs) =>
        getJson(`https://api.airplanes.live/v2/point/${lat}/${lon}/${r}`, timeoutMs, deps).then(
          parseReadsb,
        ),
    ],
  ];

  let busy = false;
  for (const [name, sourceTimeout, run] of sources) {
    const remaining = deadline - (clock() - started);
    if (remaining < MIN_ATTEMPT_MS) {
      busy = true;
      break;
    }
    if (coolingDown(name, clock())) {
      busy = true;
      continue;
    }
    if (!(await takeSlot(name, remaining, clock, deps))) {
      busy = true;
      continue;
    }
    // Another request may have struck this provider while we waited for our slot.
    if (coolingDown(name, clock())) {
      busy = true;
      continue;
    }
    const left = deadline - (clock() - started);
    if (left < MIN_ATTEMPT_MS) {
      busy = true;
      break;
    }
    try {
      const aircraft = await run(Math.min(sourceTimeout, left));
      sourceBackoff.delete(name);
      const value: FeedResponse = {
        aircraft,
        source: name,
        fetchedAt: clock(),
        ...(busy ? { busy } : {}),
      };
      return value;
    } catch (err) {
      const status = (err as { status?: number }).status;
      busy = true;
      strike(name, status === 429, clock());
      console.warn(`[adsb] ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return busyFeed(clock());
}

function busyFeed(at: number): FeedResponse {
  return {
    aircraft: [],
    source: "none",
    fetchedAt: at,
    busy: true,
    error: DATA_BUSY_MESSAGE,
  };
}

/** A cached response aged by `ageMs`: `seenPos` grows by the age so dead reckoning stays correct. */
function withAge(value: FeedResponse, ageMs: number): FeedResponse {
  if (ageMs < 500) return { ...value };
  const s = ageMs / 1000;
  return {
    ...value,
    ageMs,
    aircraft: value.aircraft.map((a) => ({ ...a, seenPos: a.seenPos + s })),
  };
}

/** True when the first usable provider would make a new request wait longer than SHED_WAIT_MS. */
function providerQueueTooLong(now: number, deps?: SourceDeps): boolean {
  for (const name of FEED_PROVIDER_ORDER) {
    if (coolingDown(name, now)) continue;
    const gap = deps?.paceGapMs ?? PROVIDER_MIN_GAP_MS[name] ?? 0;
    if (gap <= 0) return false;
    return pacingWait(name, now) > SHED_WAIT_MS;
  }
  return false;
}

/**
 * Cached + coalesced feed lookup. `lat`, `lon` and `radiusNm` are already snapped by the caller;
 * the cache key is exactly `${lat},${lon},${radiusNm}` as before.
 * - Fresh cache hit: returned without any upstream request, aged by its cache age.
 * - Busy provider (long pacing queue) and a cached tile at most STALE_MAX_MS old: that tile is
 *   returned instead of waiting.
 * - Same key already in flight in this instance: wait for that request instead of starting another.
 * - Failed results are never cached. On failure a cached result at most STALE_MAX_MS old (if any)
 *   is returned with `busy: true` and the busy message, for every caller.
 * Each caller gets its own response object built from the shared plain data.
 */
export async function loadFeedCached(
  lat: number,
  lon: number,
  radiusNm: number,
  deps?: SourceDeps,
): Promise<FeedResponse> {
  const clock = deps?.now ?? Date.now;
  const key = `${lat},${lon},${radiusNm}`;
  const hit = feedCache.get(key);
  const age = hit ? clock() - hit.at : Infinity;
  if (hit && age < FEED_TTL_MS) {
    feedStats.hits++;
    return withAge(hit.value, age);
  }
  if (hit && age <= STALE_MAX_MS && providerQueueTooLong(clock(), deps)) {
    feedStats.shed++;
    return withAge(hit.value, age);
  }

  feedStats.misses++;
  let started = false;
  const value = await coalesce(
    key,
    async () => {
      started = true;
      feedStats.upstream++;
      const v = await loadFeedCircle(lat, lon, radiusNm, deps);
      if (!v.error) {
        prune(feedCache, FEED_TTL_MS, 200, clock());
        feedCache.set(key, { at: clock(), value: v });
      }
      return v;
    },
    {
      maxMs: (deps?.deadlineMs ?? FEED_DEADLINE_MS) + WAITER_MARGIN_MS,
      onTimeout: () => busyFeed(clock()),
    },
  );
  if (!started) feedStats.shared++;
  if (!value.error) return { ...value };
  if (hit) {
    const ageNow = clock() - hit.at;
    if (ageNow <= STALE_MAX_MS) {
      feedStats.staleOnError++;
      return { ...withAge(hit.value, ageNow), busy: true, error: DATA_BUSY_MESSAGE };
    }
  }
  return { ...value };
}

export interface SearchResult {
  aircraft: Aircraft[];
  error?: string;
  source?: string;
  busy?: boolean;
}

const READSB_HOSTS = [
  ["adsb.lol", "https://api.adsb.lol/v2"],
  ["airplanes.live", "https://api.airplanes.live/v2"],
] as const;

export async function searchAircraftSources(q: string, deps?: SourceDeps): Promise<SearchResult> {
  const attempts: string[] = [];
  if (/^[0-9A-F]{6}$/.test(q)) attempts.push(`hex/${q.toLowerCase()}`);
  attempts.push(`callsign/${q}`);
  attempts.push(`reg/${q}`);
  const clock = deps?.now ?? Date.now;
  const started = clock();
  const deadline = deps?.deadlineMs ?? FEED_DEADLINE_MS;
  const timeout = deps?.readsbTimeoutMs ?? READSB_TIMEOUT_MS;
  let busy = false;

  for (const [name, base] of READSB_HOSTS) {
    const remaining = deadline - (clock() - started);
    if (remaining < MIN_ATTEMPT_MS) {
      busy = true;
      break;
    }
    if (coolingDown(name, clock())) {
      busy = true;
      continue;
    }
    let sourceFailed = false;
    for (const path of attempts) {
      const left = deadline - (clock() - started);
      if (left < MIN_ATTEMPT_MS) {
        busy = true;
        sourceFailed = true;
        break;
      }
      // Each path is its own upstream request, so each takes a slot.
      if (!(await takeSlot(name, left, clock, deps)) || coolingDown(name, clock())) {
        busy = true;
        sourceFailed = true;
        break;
      }
      const afterWait = deadline - (clock() - started);
      if (afterWait < MIN_ATTEMPT_MS) {
        busy = true;
        sourceFailed = true;
        break;
      }
      try {
        const list = parseReadsb(
          await getJson(`${base}/${path}`, Math.min(timeout, afterWait), deps),
        );
        if (list.length) {
          sourceBackoff.delete(name);
          return { aircraft: list.slice(0, 10), source: name, ...(busy ? { busy } : {}) };
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) continue;
        strike(name, status === 429, clock());
        busy = true;
        sourceFailed = true;
        console.warn("[adsb] search failed:", err instanceof Error ? err.message : err);
        break;
      }
    }
    if (!sourceFailed) return { aircraft: [], ...(busy ? { busy } : {}) };
  }
  return { aircraft: [], error: "Search unavailable right now", busy: true };
}
