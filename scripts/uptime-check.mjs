// Uptime check for the live site (Phase 21d). Usage: node scripts/uptime-check.mjs <site address>   (or set SITE_URL)
// Checks /api/health, the home page and /robots.txt. One short line per check, then OK or FAILED; exit code 1 on any
// failure. Each request has a timeout and gets one retry, so a single blip does not raise an alarm. Node 22, no packages.
import { pathToFileURL } from "node:url";

export const TIMEOUT_MS = 15_000;
export const MAX_HEALTH_AGE_MS = 5 * 60_000;

/** The checks as pure functions of a response: each returns null when fine, or a short reason. */
export const CHECKS = [
  {
    name: "health",
    path: "/api/health",
    judge: ({ status, headers, body }, now) => {
      if (status !== 200) return `HTTP ${status}`;
      if (!(headers.get("cache-control") ?? "").includes("no-store"))
        return "answer is cacheable (no no-store)";
      let json;
      try {
        json = JSON.parse(body);
      } catch {
        return "answer is not JSON";
      }
      if (json?.status !== "ok") return `status is "${json?.status}"`;
      const age = now - Date.parse(json.time);
      if (!Number.isFinite(age) || Math.abs(age) > MAX_HEALTH_AGE_MS)
        return "timestamp is missing or far from now";
      return null;
    },
  },
  {
    name: "home page",
    path: "/",
    judge: ({ status, body }) =>
      status !== 200
        ? `HTTP ${status}`
        : body.includes("SkyDeck")
          ? null
          : "page does not contain the app name",
  },
  {
    name: "robots.txt",
    path: "/robots.txt",
    judge: ({ status }) => (status === 200 ? null : `HTTP ${status}`),
  },
];

async function fetchOnce(url, fetchImpl, timeoutMs) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

/** One check with one retry. Returns { name, ok, detail }. */
export async function runCheck(
  site,
  check,
  { fetchImpl = fetch, now = Date.now, timeoutMs = TIMEOUT_MS } = {},
) {
  let last = "no answer";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchOnce(site + check.path, fetchImpl, timeoutMs);
      const problem = check.judge(res, now());
      if (!problem) return { name: check.name, ok: true, detail: `HTTP ${res.status}` };
      last = problem;
    } catch (e) {
      last =
        e?.name === "TimeoutError"
          ? "timed out"
          : `request failed (${e?.cause?.code ?? e?.message ?? "error"})`;
    }
  }
  return { name: check.name, ok: false, detail: last };
}

/** A clean https (or localhost http) address without a path, or null. */
export function cleanSite(raw) {
  try {
    const u = new URL(String(raw ?? "").trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export async function runAll(site, options) {
  const results = [];
  for (const check of CHECKS) results.push(await runCheck(site, check, options));
  return results;
}

async function main() {
  const given = (process.argv[2] || process.env.SITE_URL || "").trim();
  if (!given) {
    console.log(
      "::notice::No site address given (set the repository variable SITE_URL): nothing checked.",
    );
    process.exit(0);
  }
  const site = cleanSite(given);
  if (!site) {
    console.log("::error::The site address must be https (or http://localhost): " + given);
    process.exit(2);
  }
  const results = await runAll(site);
  for (const r of results) console.log(`${r.ok ? "ok    " : "FAILED"} ${r.name}: ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  console.log(
    failed.length
      ? `FAILED (${failed.length} of ${results.length} checks) for ${site}`
      : `OK for ${site}`,
  );
  process.exit(failed.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
