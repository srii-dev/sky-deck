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
 */

const UA = "SkyDeck/0.1 (community flight tracker)";
export const READSB_TIMEOUT_MS = 4000;
export const OPENSKY_TIMEOUT_MS = 6000;
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
 *  - OpenSky Network: anonymous budget is tiny, so it only serves the odd request.
 */
export const PROVIDER_MIN_GAP_MS: Record<string, number> = {
  "adsb.lol": 500,
  "airplanes.live": 1000,
  "OpenSky Network": 10_000,
};

const FEED_TTL_MS = 5000;
/** A waiter gives up this long after the feed deadline if the shared request never settles. */
const WAITER_MARGIN_MS = 500;
const feedCache = new Map<string, CacheEntry<FeedResponse>>();

export function resetAdsbSourceState() {
  sourceBackoff.clear();
  feedCache.clear();
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
  openSkyTimeoutMs?: number;
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

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.943844;

function parseOpenSky(json: unknown): Aircraft[] {
  const states = (json as { states?: unknown[][] })?.states ?? [];
  const out: Aircraft[] = [];
  for (const s of states) {
    const lon = num(s[5]);
    const lat = num(s[6]);
    if (lat == null || lon == null) continue;
    const baroM = num(s[7]) ?? num(s[13]);
    const vel = num(s[9]);
    const vr = num(s[11]);
    const lastContact = num(s[4]);
    out.push({
      hex: String(s[0] ?? "").toLowerCase(),
      callsign: str(s[1]),
      registration: null,
      type: null,
      description: null,
      operator: null,
      lat,
      lon,
      altFt: s[8] ? 0 : baroM != null ? baroM * M_TO_FT : null,
      onGround: !!s[8],
      gs: vel != null ? vel * MS_TO_KT : null,
      track: num(s[10]),
      vRate: vr != null ? vr * M_TO_FT * 60 : null,
      squawk: str(s[14]),
      category: null,
      kind: "generic",
      kindLabel: "Aircraft",
      seenPos: lastContact != null ? Math.max(0, Date.now() / 1000 - lastContact) : 0,
    });
  }
  return out;
}

const NM_PER_DEG_LAT = 60;

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
  const openSkyTimeout = deps?.openSkyTimeoutMs ?? OPENSKY_TIMEOUT_MS;
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
    [
      "OpenSky Network",
      openSkyTimeout,
      (timeoutMs) => {
        const dLat = r / NM_PER_DEG_LAT;
        const dLon = r / (NM_PER_DEG_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
        const q = new URLSearchParams({
          lamin: String(Math.max(-90, lat - dLat)),
          lamax: String(Math.min(90, lat + dLat)),
          lomin: String(Math.max(-180, lon - dLon)),
          lomax: String(Math.min(180, lon + dLon)),
        });
        return getJson(`https://opensky-network.org/api/states/all?${q}`, timeoutMs, deps).then(
          parseOpenSky,
        );
      },
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

/**
 * Cached + coalesced feed lookup. `lat`, `lon` and `radiusNm` are already snapped by the caller;
 * the cache key is exactly `${lat},${lon},${radiusNm}` as before.
 * - Fresh cache hit: returned without any upstream request.
 * - Same key already in flight in this instance: wait for that request instead of starting another.
 * - Failed results are never cached. On failure an older cached result (if any) is returned with
 *   `busy: true` and the busy message, for every caller.
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
  if (hit && clock() - hit.at < FEED_TTL_MS) return { ...hit.value };

  const value = await coalesce(
    key,
    async () => {
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
  if (!value.error) return { ...value };
  if (hit) return { ...hit.value, busy: true, error: DATA_BUSY_MESSAGE };
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
