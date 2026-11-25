import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFlightStages } from "@/hooks/use-flight-stages";
import { useReplay } from "@/hooks/use-replay";
import type { Aircraft, FlightRoute } from "@/lib/aircraft";
import { getFlightRoute } from "@/lib/adsb.functions";
import { FLIGHT_STAGES_KEY } from "@/lib/flight-stage";
import { REPLAY_MIN_SPAN_MS } from "@/lib/replay";
import type { WatchItem } from "@/lib/watchlist";

/* Replay recording and playback controls (Phase 9a), and the stage timeline of watched flights (Phase 11a). */

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/adsb.functions", () => ({ getFlightRoute: vi.fn(async () => null) }));

const toastMock = vi.mocked(toast);

function ac(p: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: "abc123",
    callsign: "UAL1",
    registration: "N1",
    type: "B738",
    description: null,
    operator: null,
    lat: 40,
    lon: -73,
    altFt: 10000,
    onGround: false,
    gs: 300,
    track: 90,
    vRate: 0,
    squawk: "1200",
    category: null,
    kind: "narrowbody",
    kindLabel: "Narrow-body jet",
    seenPos: 0,
    ...p,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("useReplay", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));

  type P = { aircraft: Aircraft[]; at: number | null };
  const mount = () =>
    renderHook((p: P) => useReplay(p.aircraft, p.at), {
      initialProps: { aircraft: [], at: null } as P,
    });

  it("becomes available once enough has been recorded, checked every 5 s", () => {
    const { result, rerender } = mount();
    expect(result.current.available).toBe(false);
    rerender({ aircraft: [ac({ lon: -73 })], at: 1_000_000 });
    rerender({ aircraft: [ac({ lon: -72.9 })], at: 1_000_000 + REPLAY_MIN_SPAN_MS + 1000 });
    expect(result.current.available).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.available).toBe(true);
  });

  it("does not record demo aircraft", () => {
    const { result, rerender } = mount();
    rerender({ aircraft: [ac({ hex: "mock-1" })], at: 1_000_000 });
    rerender({ aircraft: [ac({ hex: "mock-1", lon: -72 })], at: 1_000_000 + 60_000 });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.available).toBe(false);
    act(() => result.current.start());
    expect(result.current.source).toBeNull();
  });

  it("mirrors the playback clock to React, and toggle, seek and speed act on it", () => {
    const { result, rerender } = mount();
    const t0 = 1_000_000;
    rerender({ aircraft: [ac({ lon: -73 })], at: t0 });
    rerender({ aircraft: [ac({ lon: -72.9 })], at: t0 + 60_000 });
    act(() => result.current.start());
    expect(result.current.source).not.toBeNull();
    expect(result.current.view).toMatchObject({
      start: t0,
      end: t0 + 60_000,
      t: t0,
      playing: true,
      speed: 4,
    });

    act(() => {
      result.current.toggle();
      result.current.seek(t0 + 30_000);
      result.current.setSpeed(16);
    });
    // The clock changed in place; the view catches up within 250 ms.
    expect(result.current.view?.playing).toBe(true);
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.view).toMatchObject({ t: t0 + 30_000, playing: false, speed: 16 });

    act(() => result.current.seek(t0 + 999_999));
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.view?.t).toBe(t0 + 60_000);

    act(() => result.current.stop());
    expect(result.current.source).toBeNull();
    expect(result.current.view).toBeNull();
  });

  it("ignores the controls while live", () => {
    const { result } = mount();
    expect(() => {
      result.current.toggle();
      result.current.seek(5);
      result.current.setSpeed(60);
    }).not.toThrow();
    expect(result.current.view).toBeNull();
  });

  it("keeps the frozen copy when more updates arrive during playback", () => {
    const { result, rerender } = mount();
    const t0 = 1_000_000;
    rerender({ aircraft: [ac()], at: t0 });
    rerender({ aircraft: [ac({ lon: -72.9 })], at: t0 + 60_000 });
    act(() => result.current.start());
    rerender({ aircraft: [ac({ lon: -72.8 })], at: t0 + 120_000 });
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.view?.end).toBe(t0 + 60_000);
  });
});

describe("useFlightStages", () => {
  const UAL1: WatchItem = { kind: "flight", key: "UAL1", label: "UAL1", addedAt: 1 };
  const REG: WatchItem = { kind: "aircraft", key: "abc123", label: "N1", addedAt: 1 };
  type P = {
    aircraft: Aircraft[];
    watch: WatchItem[];
    alertsOn: boolean;
    onShow: (h: string) => void;
  };

  function mount(p: Partial<P> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook((props: P) => useFlightStages(props), {
      wrapper,
      initialProps: { aircraft: [], watch: [UAL1], alertsOn: true, onShow: vi.fn(), ...p },
    });
  }

  it("lists only watched flight numbers, without a stage while the flight is not in view", () => {
    const { result } = mount({ watch: [UAL1, REG] });
    expect(Object.keys(result.current)).toEqual(["UAL1"]);
    expect(result.current["UAL1"]).toMatchObject({ aircraft: null, result: null, changes: [] });
  });

  it("records stage changes, announces the notable ones with a Show button, and stores the timeline", async () => {
    const onShow = vi.fn();
    const { result, rerender } = mount({ onShow });
    const climb = ac({ callsign: " ual1 ", altFt: 12000, vRate: 1500 });
    rerender({ aircraft: [climb], watch: [UAL1], alertsOn: true, onShow });
    expect(result.current["UAL1"]?.result?.stage).toBe("climb");
    expect(toastMock).not.toHaveBeenCalled(); // the first stage seen is not a change

    rerender({ aircraft: [ac({ altFt: 35000, vRate: 0 })], watch: [UAL1], alertsOn: true, onShow });
    expect(result.current["UAL1"]?.changes.map((c) => c.stage)).toEqual(["climb", "cruise"]);
    expect(toastMock).toHaveBeenCalledWith("UAL1 has reached cruising altitude", expect.anything());
    (
      toastMock.mock.calls[0]![1] as unknown as { action: { onClick: () => void } }
    ).action.onClick();
    expect(onShow).toHaveBeenCalledWith("abc123");

    const stored = JSON.parse(localStorage.getItem(FLIGHT_STAGES_KEY)!) as Record<
      string,
      { changes: unknown[] }
    >;
    expect(stored["UAL1"]?.changes).toHaveLength(2);
    await waitFor(() => expect(vi.mocked(getFlightRoute)).toHaveBeenCalled());
  });

  it("records but stays quiet while alerts are off", () => {
    const { result, rerender } = mount({ alertsOn: false });
    rerender({ aircraft: [ac({ vRate: 1500 })], watch: [UAL1], alertsOn: false, onShow: vi.fn() });
    rerender({ aircraft: [ac({ altFt: 35000 })], watch: [UAL1], alertsOn: false, onShow: vi.fn() });
    expect(result.current["UAL1"]?.changes).toHaveLength(2);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("ignores a stale position report", () => {
    const { result, rerender } = mount();
    rerender({ aircraft: [ac({ seenPos: 60 })], watch: [UAL1], alertsOn: true, onShow: vi.fn() });
    expect(result.current["UAL1"]?.aircraft).toBeNull();
    expect(localStorage.getItem(FLIGHT_STAGES_KEY)).toBeNull();
  });

  it("continues the timeline saved in this browser", () => {
    localStorage.setItem(
      FLIGHT_STAGES_KEY,
      JSON.stringify({ UAL1: { changes: [{ stage: "climb", at: 1 }] } }),
    );
    const { result, rerender } = mount();
    expect(result.current["UAL1"]?.changes).toEqual([{ stage: "climb", at: 1 }]);
    rerender({ aircraft: [ac({ altFt: 35000 })], watch: [UAL1], alertsOn: true, onShow: vi.fn() });
    expect(toastMock).toHaveBeenCalledWith("UAL1 has reached cruising altitude", expect.anything());
  });

  it("uses the route on file for distance and ETA", async () => {
    const route: FlightRoute = {
      origin: { iata: "ORD", icao: "KORD", name: "O'Hare", location: null, lat: 41.98, lon: -87.9 },
      destination: {
        iata: "EWR",
        icao: "KEWR",
        name: "Newark",
        location: null,
        lat: 40.69,
        lon: -74.17,
      },
    };
    vi.mocked(getFlightRoute).mockResolvedValue(route);
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current["UAL1"]?.route).toEqual(route));
    rerender({
      aircraft: [ac({ lat: 41.2, lon: -80, altFt: 35000, gs: 450 })],
      watch: [UAL1],
      alertsOn: true,
      onShow: vi.fn(),
    });
    const r = result.current["UAL1"]?.result;
    expect(r?.stage).toBe("cruise");
    expect(r?.remainingNm).toBeGreaterThan(200);
    expect(r?.etaMin).toBeGreaterThan(20);
  });
});
