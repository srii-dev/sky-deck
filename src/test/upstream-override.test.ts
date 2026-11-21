import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, resetAdsbSourceState } from "@/lib/adsb-sources";
import { parseUpstreamOverride, upstreamUrl } from "@/lib/upstream-override";

afterEach(() => {
  vi.unstubAllEnvs();
  resetAdsbSourceState();
});

const FEED = "https://api.adsb.lol/v2/point/40.7/-74/25";
const ROUTE = "https://vrs-standing-data.adsb.lol/routes/SK/SKD101.json";

describe("parseUpstreamOverride", () => {
  it("accepts only http on localhost or 127.0.0.1 with a port", () => {
    expect(parseUpstreamOverride("http://localhost:4323")).toBe("http://localhost:4323");
    expect(parseUpstreamOverride("http://127.0.0.1:4323/")).toBe("http://127.0.0.1:4323");
    expect(parseUpstreamOverride("  http://127.0.0.1:1 ")).toBe("http://127.0.0.1:1");
  });

  it.each([
    undefined,
    "",
    "localhost:4323",
    "http://localhost",
    "https://localhost:4323",
    "http://example.com:4323",
    "http://localhost.example.com:4323",
    "http://127.0.0.2:4323",
    "http://[::1]:4323",
    "http://user@localhost:4323",
    "http://localhost:4323/stub",
    "http://localhost:4323?x=1",
    "http://localhost:0",
    "http://localhost:70000",
  ])("ignores %s", (value) => {
    expect(parseUpstreamOverride(value)).toBeNull();
  });
});

describe("upstreamUrl", () => {
  it("leaves the address unchanged when no override is set or it is not allowed", () => {
    expect(upstreamUrl(FEED, undefined)).toBe(FEED);
    expect(upstreamUrl(FEED, "https://evil.example:443")).toBe(FEED);
  });

  it("moves the provider host into the stub's path", () => {
    expect(upstreamUrl(FEED, "http://127.0.0.1:4323")).toBe(
      "http://127.0.0.1:4323/api.adsb.lol/v2/point/40.7/-74/25",
    );
    expect(upstreamUrl(ROUTE, "http://localhost:4323/")).toBe(
      "http://localhost:4323/vrs-standing-data.adsb.lol/routes/SK/SKD101.json",
    );
  });
});

describe("getJson reads ADSB_UPSTREAM_OVERRIDE", () => {
  async function fetchedUrl(): Promise<string> {
    let seen = "";
    await getJson(FEED, 1000, {
      fetchImpl: async (url) => {
        seen = String(url);
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    return seen;
  }

  it("asks the real provider when the variable is not set", async () => {
    vi.stubEnv("ADSB_UPSTREAM_OVERRIDE", undefined);
    expect(await fetchedUrl()).toBe(FEED);
  });

  it("asks the stub when the variable is an allowed local address", async () => {
    vi.stubEnv("ADSB_UPSTREAM_OVERRIDE", "http://127.0.0.1:4323");
    expect(await fetchedUrl()).toBe("http://127.0.0.1:4323/api.adsb.lol/v2/point/40.7/-74/25");
  });

  it("ignores a value that points anywhere else", async () => {
    vi.stubEnv("ADSB_UPSTREAM_OVERRIDE", "http://10.0.0.5:4323");
    expect(await fetchedUrl()).toBe(FEED);
  });
});
