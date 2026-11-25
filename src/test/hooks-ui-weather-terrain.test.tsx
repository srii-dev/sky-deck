import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Viewport } from "@/components/skydeck/map-config";
import type { useTerrainProfile as UseTerrainProfile } from "@/hooks/use-terrain-profile";
import { useWeatherLayers, type WeatherChoices } from "@/hooks/use-weather-layers";
import { RADAR_FRAME_MS, RADAR_INDEX_URL, RADAR_LOOP_PAUSE_MS } from "@/lib/radar";
import { distanceNm } from "@/lib/route-geometry";
import { FT_PER_M } from "@/lib/terrain-profile";
import { getAdvisories, getPireps } from "@/lib/weather.functions";

/* Weather layers (Phase 7): fetch only what is switched on, radar playback; terrain profile tiles (Phase 8b). */

vi.mock("@/lib/weather.functions", () => ({
  getAdvisories: vi.fn(async () => ({ advisories: [{ id: "s1" }], failed: [] })),
  getPireps: vi.fn(async () => ({ pireps: [{ id: "p1" }] })),
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper: Wrapper };
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const radarIndex = (times: number[], host = "https://tilecache.rainviewer.com") => ({
  host,
  radar: { past: times.map((t) => ({ time: t, path: "/v2/radar/f" + t })) },
});

const OFF: WeatherChoices = { radar: false, echoTops: false, advisories: false, pireps: false };

describe("useWeatherLayers", () => {
  type P = { c: WeatherChoices; v: Viewport | null };
  function mount(c: WeatherChoices, v: Viewport | null = null) {
    const w = wrapper();
    const r = renderHook((p: P) => useWeatherLayers(p.c, p.v), {
      wrapper: w.wrapper,
      initialProps: { c, v },
    });
    return { ...r, client: w.client };
  }

  it("fetches nothing while every layer is off", () => {
    const { result } = mount(OFF);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAdvisories).not.toHaveBeenCalled();
    expect(getPireps).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      radarUrl: null,
      advisories: null,
      pireps: null,
      echoTops: false,
    });
    expect(result.current.radar).toMatchObject({ loading: false, error: false, frames: [] });
  });

  it("loads the radar index from RainViewer and shows the newest frame", async () => {
    fetchMock.mockImplementation(() => json(radarIndex([300, 100, 200])));
    const { result } = mount({ ...OFF, radar: true });
    expect(result.current.radar.loading).toBe(true);
    await waitFor(() => expect(result.current.radar.frames).toHaveLength(3));
    expect(fetchMock).toHaveBeenCalledWith(RADAR_INDEX_URL);
    expect(result.current.radar.index).toBe(2);
    expect(result.current.state.radarUrl).toBe(
      "https://tilecache.rainviewer.com/v2/radar/f300/256/{z}/{x}/{y}/2/1_1.png",
    );
  });

  it.each([
    ["an HTTP error", () => json({}, 503)],
    ["an index pointing at another host", () => json(radarIndex([1], "https://evil.example"))],
  ])("reports a radar error on %s, after one retry", async (_n, answer) => {
    fetchMock.mockImplementation(answer);
    const { result } = mount({ ...OFF, radar: true });
    await waitFor(() => expect(result.current.radar.error).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.state.radarUrl).toBeNull();
  });

  it("keeps the chosen frame when the index refreshes", async () => {
    fetchMock.mockImplementation(() => json(radarIndex([100, 200, 300])));
    const { result, client } = mount({ ...OFF, radar: true });
    await waitFor(() => expect(result.current.radar.frames).toHaveLength(3));
    act(() => result.current.radar.setIndex(1)); // time 200
    fetchMock.mockImplementation(() => json(radarIndex([200, 300, 400, 500])));
    await act(() => client.refetchQueries({ queryKey: ["radar-index"] }));
    await waitFor(() => expect(result.current.radar.frames).toHaveLength(4));
    expect(result.current.radar.index).toBe(0);
  });

  it("plays the frames, pauses longer on the newest, wraps, and stops when radar is switched off", async () => {
    fetchMock.mockImplementation(() => json(radarIndex([100, 200, 300])));
    const { result, rerender } = mount({ ...OFF, radar: true });
    await waitFor(() => expect(result.current.radar.frames).toHaveLength(3));
    vi.useFakeTimers();
    act(() => result.current.radar.setPlaying(true));
    // On the newest frame: the loop pause comes first.
    act(() => vi.advanceTimersByTime(RADAR_FRAME_MS));
    expect(result.current.radar.index).toBe(2);
    act(() => vi.advanceTimersByTime(RADAR_LOOP_PAUSE_MS - RADAR_FRAME_MS));
    expect(result.current.radar.index).toBe(0);
    act(() => vi.advanceTimersByTime(RADAR_FRAME_MS));
    expect(result.current.radar.index).toBe(1);

    rerender({ c: OFF, v: null });
    expect(result.current.radar.playing).toBe(false);
    expect(result.current.state.radarUrl).toBeNull();
  });

  it("shows advisories when on and flags a partial answer", async () => {
    vi.mocked(getAdvisories).mockResolvedValueOnce({
      advisories: [{ id: "s1" }],
      failed: ["gairmet"],
    } as never);
    const { result } = mount({ ...OFF, advisories: true });
    await waitFor(() => expect(result.current.advisories).toHaveLength(1));
    expect(result.current.state.advisories).toHaveLength(1);
    expect(result.current.advisoryFailed).toBe(true);
  });

  it("asks for pilot reports only with a view, for the rounded box", async () => {
    const view = {
      lat: 40,
      lon: -74,
      radiusNm: 100,
      bounds: { south: 39.4, west: -75.2, north: 41.6, east: -72.7 },
    } as Viewport;
    const { result, rerender } = mount({ ...OFF, pireps: true });
    expect(getPireps).not.toHaveBeenCalled();
    rerender({ c: { ...OFF, pireps: true }, v: view });
    await waitFor(() => expect(result.current.state.pireps).toHaveLength(1));
    expect(getPireps).toHaveBeenCalledWith({
      data: { south: 39, west: -76, north: 42, east: -72 },
    });
    expect(result.current.pirepFailed).toBe(false);
  });

  it("flags failed pilot reports", async () => {
    vi.mocked(getPireps).mockRejectedValue(new Error("429"));
    const view = {
      lat: 0,
      lon: 0,
      radiusNm: 1,
      bounds: { south: 0, west: 0, north: 1, east: 1 },
    } as Viewport;
    const { result } = mount({ ...OFF, pireps: true }, view);
    await waitFor(() => expect(result.current.pirepFailed).toBe(true));
  });

  it("passes the echo tops switch straight through", () => {
    expect(mount({ ...OFF, echoTops: true }).result.current.state.echoTops).toBe(true);
  });
});

describe("useTerrainProfile", () => {
  // The decoded tiles are cached per module: a fresh module per test.
  async function freshHook(): Promise<typeof UseTerrainProfile> {
    vi.resetModules();
    return (await import("@/hooks/use-terrain-profile")).useTerrainProfile;
  }

  /** Every pixel encodes 1000 m in Terrarium (R * 256 + G + B / 256 - 32768). */
  function stubCanvas(ctx: "ok" | "none" = "ok") {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({})),
    );
    const data = new Uint8ClampedArray(256 * 256 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 131;
      data[i + 1] = 232;
      data[i + 2] = 0;
    }
    return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx === "ok"
        ? ({
            drawImage: vi.fn(),
            getImageData: () => ({ data }),
          } as unknown as CanvasRenderingContext2D)
        : null,
    );
  }

  const JFK = { lat: 40.64, lon: -73.78 };
  const BOS = { lat: 42.36, lon: -71.01 };

  it("does nothing while switched off or for a route too short to draw", async () => {
    const useTerrainProfile = await freshHook();
    const { wrapper: w } = wrapper();
    const off = renderHook(() => useTerrainProfile(JFK, BOS, false), { wrapper: w });
    const same = renderHook(() => useTerrainProfile(JFK, JFK, true), { wrapper: w });
    const none = renderHook(() => useTerrainProfile(null, BOS, true), { wrapper: w });
    for (const r of [off, same, none]) expect(r.result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("samples 60 points along the route, loading each tile once", async () => {
    const spy = stubCanvas();
    fetchMock.mockImplementation(async () => new Response(new Blob(["png"])));
    const useTerrainProfile = await freshHook();
    const { result } = renderHook(() => useTerrainProfile(JFK, BOS, true), {
      wrapper: wrapper().wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const { points, totalNm } = result.current.data!;
    expect(points).toHaveLength(60);
    expect(totalNm).toBeCloseTo(distanceNm(JFK, BOS), 6);
    expect(points[0]!.elevFt).toBeCloseTo(1000 * FT_PER_M, 3);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((u) => u.includes("elevation-tiles-prod"))).toBe(true);
    expect(spy).toHaveBeenCalledWith("2d", { willReadFrequently: true });
  });

  it("leaves elevations empty for tiles that fail, and retries a thrown tile later", async () => {
    stubCanvas();
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const useTerrainProfile = await freshHook();
    const first = renderHook(() => useTerrainProfile(JFK, BOS, true), {
      wrapper: wrapper().wrapper,
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(first.result.current.data!.points.every((p) => p.elevFt === null)).toBe(true);
    const tries = fetchMock.mock.calls.length;

    fetchMock.mockImplementation(async () => new Response(new Blob(["png"])));
    const again = renderHook(() => useTerrainProfile(JFK, BOS, true), {
      wrapper: wrapper().wrapper,
    });
    await waitFor(() => expect(again.result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls.length).toBe(tries * 2);
    expect(again.result.current.data!.points[0]!.elevFt).not.toBeNull();
  });

  it("leaves elevations empty on an HTTP error or without a 2D canvas", async () => {
    stubCanvas("none");
    fetchMock.mockImplementation(async () => new Response(new Blob(["png"])));
    let useTerrainProfile = await freshHook();
    const noCtx = renderHook(() => useTerrainProfile(JFK, BOS, true), {
      wrapper: wrapper().wrapper,
    });
    await waitFor(() => expect(noCtx.result.current.isSuccess).toBe(true));
    expect(noCtx.result.current.data!.points.every((p) => p.elevFt === null)).toBe(true);

    stubCanvas();
    fetchMock.mockImplementation(async () => new Response("", { status: 404 }));
    useTerrainProfile = await freshHook();
    const http = renderHook(() => useTerrainProfile(JFK, BOS, true), {
      wrapper: wrapper().wrapper,
    });
    await waitFor(() => expect(http.result.current.isSuccess).toBe(true));
    expect(http.result.current.data!.points.every((p) => p.elevFt === null)).toBe(true);
  });
});
