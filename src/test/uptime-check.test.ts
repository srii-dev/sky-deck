import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* The uptime script is a plain .mjs file (no types); it is loaded by path so tsc does not need to read it. */
type Check = { name: string; path: string; judge: (r: unknown, now: number) => string | null };
type Mod = {
  CHECKS: Check[];
  cleanSite: (v: unknown) => string | null;
  runCheck: (
    site: string,
    check: Check,
    o?: {
      fetchImpl?: (u: string, i?: unknown) => Promise<Response>;
      now?: () => number;
      timeoutMs?: number;
    },
  ) => Promise<{ name: string; ok: boolean; detail: string }>;
  runAll: (site: string, o?: unknown) => Promise<{ name: string; ok: boolean; detail: string }[]>;
};
const load = () =>
  import(
    /* @vite-ignore */ pathToFileURL(resolve(process.cwd(), "scripts/uptime-check.mjs")).href
  ) as Promise<Mod>;

const NOW = Date.parse("2026-11-16T12:00:00Z");
const health = (
  over: Record<string, unknown> = {},
  headers: Record<string, string> = { "cache-control": "no-store" },
) =>
  new Response(
    JSON.stringify({ status: "ok", time: new Date(NOW - 1000).toISOString(), ...over }),
    { status: 200, headers },
  );

describe("uptime check", () => {
  it("accepts a healthy site", async () => {
    const m = await load();
    const fetchImpl = async (u: string) =>
      u.endsWith("/api/health")
        ? health()
        : new Response("<title>SkyDeck</title> User-agent: *", { status: 200 });
    const out = await m.runAll("https://s.example", { fetchImpl, now: () => NOW });
    expect(out.map((r) => [r.name, r.ok])).toEqual([
      ["health", true],
      ["home page", true],
      ["robots.txt", true],
    ]);
  });

  it("fails on each kind of health problem", async () => {
    const m = await load();
    const health_ = m.CHECKS.find((c) => c.name === "health")!;
    const run = async (res: Response) =>
      (
        await m.runCheck("https://s", health_, {
          fetchImpl: async () => res.clone(),
          now: () => NOW,
        })
      ).detail;
    expect(await run(new Response("x", { status: 503 }))).toBe("HTTP 503");
    expect(await run(health({}, {}))).toMatch(/cacheable/);
    expect(await run(new Response("nope", { headers: { "cache-control": "no-store" } }))).toMatch(
      /not JSON/,
    );
    expect(await run(health({ status: "degraded" }))).toMatch(/status is/);
    expect(await run(health({ time: "2020-01-01T00:00:00Z" }))).toMatch(/timestamp/);
  });

  it("fails when the home page loses the app name", async () => {
    const m = await load();
    const home = m.CHECKS.find((c) => c.name === "home page")!;
    const r = await m.runCheck("https://s", home, {
      fetchImpl: async () => new Response("<h1>Error</h1>", { status: 200 }),
    });
    expect(r).toMatchObject({ ok: false, detail: expect.stringMatching(/app name/) });
  });

  it("retries once, so one blip passes and two failures fail", async () => {
    const m = await load();
    const robots = m.CHECKS.find((c) => c.name === "robots.txt")!;
    let calls = 0;
    const blip = async () => {
      calls++;
      if (calls === 1) throw new Error("reset");
      return new Response("ok", { status: 200 });
    };
    expect((await m.runCheck("https://s", robots, { fetchImpl: blip })).ok).toBe(true);
    expect(calls).toBe(2);
    calls = 0;
    const down = async () => {
      calls++;
      throw new Error("refused");
    };
    const r = await m.runCheck("https://s", robots, { fetchImpl: down });
    expect(r.ok).toBe(false);
    expect(calls).toBe(2);
  });

  it("reports a timeout as a timeout", async () => {
    const m = await load();
    const robots = m.CHECKS.find((c) => c.name === "robots.txt")!;
    const slow = (_: string, init?: unknown) =>
      new Promise<Response>((_res, rej) =>
        (init as { signal: AbortSignal }).signal.addEventListener("abort", () =>
          rej((init as { signal: AbortSignal }).signal.reason),
        ),
      );
    const r = await m.runCheck("https://s", robots, { fetchImpl: slow, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, detail: "timed out" });
  });

  it("takes only a clean https address", async () => {
    const m = await load();
    expect(m.cleanSite("https://a.example/path?x=1")).toBe("https://a.example");
    expect(m.cleanSite("http://localhost:4321")).toBe("http://localhost:4321");
    for (const bad of ["http://a.example", "a.example", "", null, "ftp://a.example"])
      expect(m.cleanSite(bad)).toBeNull();
  });
});
