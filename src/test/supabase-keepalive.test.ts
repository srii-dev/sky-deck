import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEEPALIVE_CRON,
  envFromBindings,
  keepaliveUrl,
  pingSupabase,
  runSupabaseKeepalive,
} from "@/lib/supabase-keepalive.server";

const env = { SUPABASE_URL: "https://abc.supabase.co/", SUPABASE_ANON_KEY: "anon-value" };

afterEach(() => vi.restoreAllMocks());

describe("Supabase keep-alive", () => {
  it("reads one row of an RLS table as anon, nothing more", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }));
    expect(await pingSupabase(env, fetchImpl)).toEqual({ ok: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://abc.supabase.co/rest/v1/profiles?select=id&limit=1");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.headers).toMatchObject({
      apikey: "anon-value",
      authorization: "Bearer anon-value",
    });
  });

  it("skips without calling out when Supabase is not configured", async () => {
    const fetchImpl = vi.fn();
    expect(await pingSupabase({}, fetchImpl)).toEqual({ ok: false, reason: "not-configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports HTTP and network failures without throwing", async () => {
    expect(await pingSupabase(env, async () => new Response("", { status: 503 }))).toEqual({
      ok: false,
      status: 503,
      reason: "http-error",
    });
    expect(
      await pingSupabase(env, async () => {
        throw new TypeError("fetch failed");
      }),
    ).toEqual({ ok: false, reason: "network-error" });
  });

  it("prefers the Worker's string bindings over process.env and ignores other bindings", () => {
    const merged = envFromBindings(
      { SUPABASE_URL: "https://b.supabase.co", FEED_HUB: { idFromName() {} } },
      { SUPABASE_URL: "https://a.supabase.co", OTHER: "x" },
    );
    expect(merged).toEqual({ SUPABASE_URL: "https://b.supabase.co", OTHER: "x" });
  });

  it("logs the status only, never the key", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSupabaseKeepalive(env, async () => new Response("[]", { status: 200 }));
    const printed = log.mock.calls.flat().join(" ");
    expect(printed).toContain("ok (200)");
    expect(printed).not.toContain("anon-value");
  });

  it("builds the URL without a double slash and runs once a day", () => {
    expect(keepaliveUrl("https://x.supabase.co//")).toBe(
      "https://x.supabase.co/rest/v1/profiles?select=id&limit=1",
    );
    expect(KEEPALIVE_CRON.split(" ")).toHaveLength(5);
    expect(KEEPALIVE_CRON).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});
