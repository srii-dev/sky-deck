import { normalizeAirframesMessages, type AcarsMessage } from "./acars-messages";
import {
  coalesce,
  defaultSleep,
  reserveSlot,
  resetInflight,
  resetPacing,
  type Sleep,
} from "./request-control";

/*
 * Client for the public Airframes API (GET /v1/messages), used to show recent ACARS messages for one aircraft.
 *
 * EXCEPTION to the "browser never calls ADS-B providers directly" rule in AGENTS.md, on purpose:
 * this runs IN THE BROWSER. Airframes allows cross-origin calls, every visitor then has their own request budget
 * (60 per minute per client address, anonymous), and no message ever passes through or is stored on our server.
 * The trade-offs: Airframes sees the visitor's address, and it could change CORS or rate limits at any time.
 * The API is pre-release; anonymous access is not guaranteed.
 *
 * No API key is used. Messages are untrusted text: normalisation (acars-messages.ts) cleans them, and the UI
 * must render them as plain text only. Nothing here logs message content.
 */

export const AIRFRAMES_BASE_URL = "https://api.airframes.io/v1";
export const AIRFRAMES_SITE_URL = "https://airframes.io";
export const AIRFRAMES_ATTRIBUTION = "Data provided by Airframes.io and its community of feeders";

/** Minimum gap between the starts of two requests (the anonymous limit is 60 per minute). */
export const AIRFRAMES_MIN_GAP_MS = 1500;
/** A fresh result for an aircraft is reused for this long. */
export const AIRFRAMES_CACHE_MS = 60_000;
/** Messages requested per aircraft (the API maximum is 100). */
export const AIRFRAMES_LIMIT = 20;
export const AIRFRAMES_TIMEOUT_MS = 8000;
/** How long to stop sending after a 429 without a Retry-After header, and the longest we will ever wait. */
const DEFAULT_BLOCK_MS = 60_000;
const MAX_BLOCK_MS = 5 * 60_000;
const PACE_KEY = "airframes";

export type AcarsFetchResult =
  | { ok: true; messages: AcarsMessage[]; fetchedAt: number; cached: boolean }
  | { ok: false; error: string; retryAfterMs?: number };

export interface AirframesDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: Sleep;
  timeoutMs?: number;
  minGapMs?: number;
}

const cache = new Map<string, { at: number; messages: AcarsMessage[] }>();
let blockedUntil = 0;

/** Test hook: forget cached results, rate-limit blocks, pacing and in-flight requests. */
export function resetAirframesState() {
  cache.clear();
  blockedUntil = 0;
  resetPacing();
  resetInflight();
}

/**
 * Request URL for one aircraft, or null when `hex` is not exactly six hex digits.
 * The API treats the icao filter as a pattern (it accepts SQL wildcards), so this strict check matters.
 */
export function buildMessagesUrl(hex: string): string | null {
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `${AIRFRAMES_BASE_URL}/messages?icao=${hex.toLowerCase()}&limit=${AIRFRAMES_LIMIT}`;
}

function limitedMessage(ms: number): string {
  return `Airframes is limiting requests. Try again in ${Math.max(1, Math.ceil(ms / 1000))} s.`;
}

function clampBlock(ms: number): number {
  return Math.min(MAX_BLOCK_MS, Math.max(1000, ms));
}

/** Remember a pause when the response says the budget is used up. */
function noteRateLimit(headers: Headers, status: number, now: number) {
  if (status === 429) {
    const retry = Number(headers.get("retry-after"));
    const ms = Number.isFinite(retry) && retry > 0 ? retry * 1000 : DEFAULT_BLOCK_MS;
    blockedUntil = Math.max(blockedUntil, now + clampBlock(ms));
    return;
  }
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (remaining !== null && Number(remaining) <= 0 && Number.isFinite(reset) && reset > 0) {
    blockedUntil = Math.max(blockedUntil, now + clampBlock(reset * 1000 - now));
  }
}

async function load(hex: string, url: string, deps?: AirframesDeps): Promise<AcarsFetchResult> {
  const clock = deps?.now ?? Date.now;
  const wait = reserveSlot(PACE_KEY, deps?.minGapMs ?? AIRFRAMES_MIN_GAP_MS, clock());
  if (wait > 0) await (deps?.sleep ?? defaultSleep)(wait);
  // Another request may have hit the limit while this one waited for its turn.
  if (clock() < blockedUntil) {
    const left = blockedUntil - clock();
    return { ok: false, error: limitedMessage(left), retryAfterMs: left };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps?.timeoutMs ?? AIRFRAMES_TIMEOUT_MS);
  let res: Response;
  try {
    // Only the Accept header: a "simple" cross-origin request, so the browser sends no preflight.
    res = await (deps?.fetchImpl ?? fetch)(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
  } catch {
    return { ok: false, error: "Could not reach Airframes" };
  } finally {
    clearTimeout(timer);
  }

  noteRateLimit(res.headers, res.status, clock());
  if (res.status === 429) {
    const left = Math.max(0, blockedUntil - clock());
    return { ok: false, error: limitedMessage(left), retryAfterMs: left };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Airframes now requires access for this request" };
  }
  if (!res.ok) return { ok: false, error: `Airframes returned HTTP ${res.status}` };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "Unexpected response from Airframes" };
  }
  if (!Array.isArray(json)) return { ok: false, error: "Unexpected response from Airframes" };

  const messages = normalizeAirframesMessages(json);
  const at = clock();
  cache.set(hex, { at, messages });
  return { ok: true, messages, fetchedAt: at, cached: false };
}

/**
 * Recent ACARS messages for one aircraft (ICAO hex), newest first.
 * Cached for AIRFRAMES_CACHE_MS, identical in-flight requests are shared, requests are spaced out, and a
 * rate-limit response pauses all further requests until it is over.
 */
export async function fetchAircraftMessages(
  hex: string,
  deps?: AirframesDeps,
): Promise<AcarsFetchResult> {
  const url = buildMessagesUrl(hex);
  if (!url) return { ok: false, error: "Not a valid aircraft address" };
  const key = hex.toLowerCase();
  const clock = deps?.now ?? Date.now;

  const hit = cache.get(key);
  if (hit && clock() - hit.at < AIRFRAMES_CACHE_MS) {
    return { ok: true, messages: hit.messages, fetchedAt: hit.at, cached: true };
  }
  if (clock() < blockedUntil) {
    const left = blockedUntil - clock();
    return { ok: false, error: limitedMessage(left), retryAfterMs: left };
  }

  return coalesce(`airframes:${key}`, () => load(key, url, deps), {
    maxMs: (deps?.timeoutMs ?? AIRFRAMES_TIMEOUT_MS) + 5000,
    onTimeout: () => ({ ok: false, error: "Airframes did not answer in time" }),
  });
}
