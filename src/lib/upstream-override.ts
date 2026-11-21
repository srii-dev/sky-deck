/*
 * Test seam (Phase 16f): ADSB_UPSTREAM_OVERRIDE sends the ADS-B provider requests and the route lookup to a local
 * stub (e2e/stub-upstream.mjs) instead of the real hosts, so the end-to-end tests never depend on live data.
 * Only a plain http address on localhost or 127.0.0.1 with a port is honoured; anything else is ignored, so a
 * mistake in production can never send visitors' requests to another host. Not a secret. Pure functions.
 */

/** The stub's origin ("http://127.0.0.1:4323"), or null when the value is missing or not allowed. */
export function parseUpstreamOverride(value: string | undefined): string | null {
  const m = /^http:\/\/(localhost|127\.0\.0\.1):(\d{1,5})\/?$/.exec(value?.trim() ?? "");
  if (!m) return null;
  const port = Number(m[2]);
  return port >= 1 && port <= 65535 ? `http://${m[1]}:${port}` : null;
}

/**
 * The address to fetch. Without an allowed override it is `url` unchanged; with one, the provider's host becomes the
 * first part of the stub's path (https://api.adsb.lol/v2/... -> http://127.0.0.1:4323/api.adsb.lol/v2/...).
 */
export function upstreamUrl(url: string, override: string | undefined): string {
  const base = parseUpstreamOverride(override);
  return base && url.startsWith("https://") ? `${base}/${url.slice("https://".length)}` : url;
}
