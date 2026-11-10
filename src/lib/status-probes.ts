/*
 * Status page probes (Phase 23d): one small request to each outside service the app relies on, with a time limit, so
 * the page can say which are answering. The probes are plain data and the fetch is passed in, so tests need no network.
 * They are run at most once a minute per server (see status.functions.ts), never once per visitor.
 */

export type ProbeState = "ok" | "slow" | "blocked" | "down" | "not-configured" | "unused";

export interface ProbeResult {
  id: string;
  name: string;
  /** What it is used for, in words a visitor understands. */
  usedFor: string;
  state: ProbeState;
  /** How long the answer took, ms; null when there was none. */
  ms: number | null;
  /** A short plain note, for example the HTTP status. */
  note: string;
}

export interface Probe {
  id: string;
  name: string;
  usedFor: string;
  /** The address and headers to ask, or null when this service is not set up or not used. */
  request: { url: string; headers?: Record<string, string> } | null;
  /** Shown when request is null. */
  skipped?: { state: "not-configured" | "unused"; note: string };
}

export const PROBE_TIMEOUT_MS = 5000;
/** An answer slower than this still counts as working, but is called slow. */
export const SLOW_MS = 3000;

export function buildProbes(env: Record<string, string | undefined>): Probe[] {
  const supabaseUrl = (env["SUPABASE_URL"] ?? "").trim().replace(/\/+$/, "");
  const anon = (env["SUPABASE_ANON_KEY"] ?? "").trim();
  return [
    {
      id: "adsb-lol",
      name: "adsb.lol",
      usedFor: "Live aircraft positions (main source)",
      request: { url: "https://api.adsb.lol/v2/point/40.64/-73.78/5" },
    },
    {
      id: "airplanes-live",
      name: "airplanes.live",
      usedFor: "Live aircraft positions (backup source)",
      request: { url: "https://api.airplanes.live/v2/point/40.64/-73.78/5" },
    },
    {
      id: "weather",
      name: "Aviation Weather Center",
      usedFor: "Airport weather and weather advisories",
      request: { url: "https://aviationweather.gov/api/data/metar?ids=KJFK&format=json" },
    },
    {
      id: "faa-status",
      name: "FAA airport status",
      usedFor: "Airport delays and closures",
      request: { url: "https://nasstatus.faa.gov/api/airport-status-information" },
    },
    {
      id: "faa-airspace",
      name: "FAA airspace data",
      usedFor: "Airspace areas on the map",
      request: {
        url: "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services?f=json",
      },
    },
    supabaseUrl && anon
      ? {
          id: "accounts",
          name: "Accounts and sync",
          usedFor: "Sign-in and the synced watchlist",
          request: { url: supabaseUrl + "/auth/v1/health", headers: { apikey: anon } },
        }
      : {
          id: "accounts",
          name: "Accounts and sync",
          usedFor: "Sign-in and the synced watchlist",
          request: null,
          skipped: { state: "not-configured", note: "Accounts are not set up on this server." },
        },
    {
      id: "ai",
      name: "AI",
      usedFor: "AI briefs",
      request: null,
      skipped: { state: "unused", note: "No feature uses AI yet." },
    },
  ];
}

export type FetchLike = (
  url: string,
  init: { headers?: Record<string, string>; signal: AbortSignal },
) => Promise<{ status: number; ok: boolean }>;

/** Run one probe. Never throws. */
export async function runProbe(
  probe: Probe,
  fetchFn: FetchLike,
  now: () => number = Date.now,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  const base = { id: probe.id, name: probe.name, usedFor: probe.usedFor };
  if (!probe.request) {
    return {
      ...base,
      state: probe.skipped?.state ?? "unused",
      ms: null,
      note: probe.skipped?.note ?? "",
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = now();
  try {
    const init: { headers?: Record<string, string>; signal: AbortSignal } = {
      signal: ctrl.signal,
    };
    if (probe.request.headers) init.headers = probe.request.headers;
    const res = await fetchFn(probe.request.url, init);
    const ms = Math.max(0, now() - start);
    if (res.ok) {
      return {
        ...base,
        state: ms >= SLOW_MS ? "slow" : "ok",
        ms,
        note: ms >= SLOW_MS ? "Answering slowly" : "Answering",
      };
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return {
        ...base,
        state: "blocked",
        ms,
        note: "Refused our server (HTTP " + res.status + ")",
      };
    }
    return { ...base, state: "down", ms, note: "Error answer (HTTP " + res.status + ")" };
  } catch {
    return {
      ...base,
      state: "down",
      ms: null,
      note: "No answer within " + timeoutMs / 1000 + " s",
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface StatusReport {
  checkedAt: number;
  results: ProbeResult[];
  /** "ok" when everything that is used answers, "degraded" when some do, "down" when none do. */
  overall: "ok" | "degraded" | "down";
}

export function summarize(results: ProbeResult[], checkedAt: number): StatusReport {
  const used = results.filter((r) => r.state !== "unused" && r.state !== "not-configured");
  const good = used.filter((r) => r.state === "ok" || r.state === "slow").length;
  const overall =
    used.length === 0 || good === used.length ? "ok" : good === 0 ? "down" : "degraded";
  return { checkedAt, results, overall };
}

export async function runAllProbes(
  env: Record<string, string | undefined>,
  fetchFn: FetchLike,
  now: () => number = Date.now,
): Promise<StatusReport> {
  const results = await Promise.all(buildProbes(env).map((p) => runProbe(p, fetchFn, now)));
  return summarize(results, now());
}
