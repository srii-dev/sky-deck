import { afterEach, describe, expect, it } from "vitest";
import { DATA_BUSY_MESSAGE } from "@/lib/aircraft";
import {
  loadFeedCircle,
  resetAdsbSourceState,
  searchAircraftSources,
  type SourceDeps,
} from "@/lib/adsb-sources";

afterEach(() => {
  resetAdsbSourceState();
});

const ac = {
  hex: "abc123",
  flight: "TST1",
  lat: 40.7,
  lon: -74,
  alt_baro: 1000,
  seen_pos: 1,
  squawk: "1200",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hang(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort);
  });
}

const fast: Pick<SourceDeps, "readsbTimeoutMs" | "deadlineMs" | "paceGapMs"> = {
  readsbTimeoutMs: 40,
  deadlineMs: 500,
  paceGapMs: 0, // pacing has its own tests; these tests are about fallback order
};

describe("feed fallback", () => {
  it("uses airplanes.live when the primary source fails", async () => {
    const urls: string[] = [];
    const res = await loadFeedCircle(40.7, -74, 25, {
      ...fast,
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).includes("adsb.lol")) return new Response("no", { status: 500 });
        if (String(url).includes("airplanes.live")) return json({ ac: [ac] });
        throw new Error("only adsb.lol and airplanes.live may be called");
      },
    });
    expect(res.source).toBe("airplanes.live");
    expect(res.busy).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.aircraft).toHaveLength(1);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes("opensky"))).toBe(false);
  });

  it("does not wait out a slow primary source", async () => {
    const started = Date.now();
    const res = await loadFeedCircle(40.7, -74, 25, {
      ...fast,
      fetchImpl: (url, init) => {
        if (String(url).includes("adsb.lol")) return hang(init);
        if (String(url).includes("airplanes.live")) return Promise.resolve(json({ ac: [ac] }));
        return Promise.reject(new Error("only adsb.lol and airplanes.live may be called"));
      },
    });
    expect(res.source).toBe("airplanes.live");
    expect(res.aircraft).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(300);
  });

  it("returns before the deadline when every source fails", async () => {
    const started = Date.now();
    const res = await loadFeedCircle(40.7, -74, 25, {
      paceGapMs: 0,
      readsbTimeoutMs: 1000,
      deadlineMs: 400,
      fetchImpl: (url, init) => {
        // airplanes.live hangs past the deadline; adsb.lol fails straight away.
        if (String(url).includes("airplanes.live")) return hang(init);
        return Promise.resolve(new Response("no", { status: 503 }));
      },
    });
    expect(res).toMatchObject({
      aircraft: [],
      source: "none",
      busy: true,
      error: DATA_BUSY_MESSAGE,
    });
    expect(Date.now() - started).toBeLessThan(700);
  });

  it("never calls OpenSky, even when both providers fail", async () => {
    const urls: string[] = [];
    const res = await loadFeedCircle(40.7, -74, 25, {
      ...fast,
      fetchImpl: async (url) => {
        urls.push(String(url));
        return new Response("no", { status: 503 });
      },
    });
    expect(res).toMatchObject({ source: "none", busy: true, error: DATA_BUSY_MESSAGE });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("adsb.lol");
    expect(urls[1]).toContain("airplanes.live");
    expect(urls.some((u) => u.includes("opensky"))).toBe(false);
  });
});

describe("search fallback", () => {
  it("tries airplanes.live when adsb.lol fails", async () => {
    const res = await searchAircraftSources("UAL123", {
      ...fast,
      fetchImpl: async (url) => {
        if (String(url).includes("adsb.lol")) return new Response("no", { status: 500 });
        return json({ ac: [{ ...ac, flight: "UAL123" }] });
      },
    });
    expect(res.source).toBe("airplanes.live");
    expect(res.busy).toBe(true);
    expect(res.aircraft).toHaveLength(1);
    expect(res.error).toBeUndefined();
  });

  it("skips a source that is cooling down", async () => {
    const failPrimary: SourceDeps["fetchImpl"] = async (url) => {
      if (String(url).includes("adsb.lol")) return new Response("no", { status: 500 });
      return json({ ac: [ac] });
    };
    await searchAircraftSources("UAL123", { ...fast, fetchImpl: failPrimary });
    const urls: string[] = [];
    const res = await searchAircraftSources("UAL123", {
      ...fast,
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).includes("adsb.lol")) return new Response("no", { status: 500 });
        return json({ ac: [ac] });
      },
    });
    expect(urls.some((u) => u.includes("adsb.lol"))).toBe(false);
    expect(urls.some((u) => u.includes("airplanes.live"))).toBe(true);
    expect(res.source).toBe("airplanes.live");
    expect(res.busy).toBe(true);
  });

  it("follows a 404 to the next path without cooling adsb.lol", async () => {
    const urls: string[] = [];
    const res = await searchAircraftSources("ABCDEF", {
      ...fast,
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).includes("/hex/")) return new Response("missing", { status: 404 });
        return json({ ac: [{ ...ac, hex: "abcdef" }] });
      },
    });
    expect(res.source).toBe("adsb.lol");
    expect(res.aircraft).toHaveLength(1);
    expect(res.busy).toBeUndefined();
    expect(urls.every((u) => u.includes("adsb.lol"))).toBe(true);

    const feedUrls: string[] = [];
    await loadFeedCircle(40.7, -74, 25, {
      ...fast,
      fetchImpl: async (url) => {
        feedUrls.push(String(url));
        return json({ ac: [ac] });
      },
    });
    expect(feedUrls[0]).toContain("adsb.lol");
  });
});
