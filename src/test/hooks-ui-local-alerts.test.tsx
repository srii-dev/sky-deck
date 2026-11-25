import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAlertRules } from "@/hooks/use-alert-rules";
import { useCollection } from "@/hooks/use-collection";
import { useWatchAlerts } from "@/hooks/use-watch-alerts";
import type { Aircraft } from "@/lib/aircraft";
import { ALERT_RULES_KEY, MAX_ALERT_RULES, type AlertRule } from "@/lib/alert-rules";
import { isLargeLoaded, loadLargeAirports } from "@/lib/airport-list";
import { COLLECTION_KEY, emptyCollection } from "@/lib/collection";
import type { WatchItem } from "@/lib/watchlist";

/* The page-open alerting hooks and the collection: what they store, when they speak, and when they stay quiet. */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/lib/airport-list", () => ({
  currentAirportList: () => [
    {
      iata: "JFK",
      icao: "KJFK",
      name: "John F. Kennedy Intl",
      city: "New York",
      lat: 40.64,
      lon: -73.78,
    },
  ],
  isLargeLoaded: vi.fn(() => false),
  loadLargeAirports: vi.fn(async () => []),
}));

const toastMock = vi.mocked(toast);
const toastError = vi.mocked(toast.error);

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
    kindLabel: "Jet",
    seenPos: 1,
    ...p,
  } as Aircraft;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.clearAllMocks());

const toastTitles = () => toastMock.mock.calls.map((c) => String(c[0]));

describe("useCollection", () => {
  it("reads the saved collection after the first render", () => {
    const saved = emptyCollection();
    saved.types["A320"] = { first: 1, count: 3, shape: "narrowbody" } as never;
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(saved));
    const { result } = renderHook(() => useCollection(null));
    expect(result.current.collection.types["A320"]?.count).toBe(3);
  });

  it("counts each aircraft once per visit and stores it", () => {
    const { result, rerender } = renderHook(({ a }: { a: Aircraft | null }) => useCollection(a), {
      initialProps: { a: ac() as Aircraft | null },
    });
    expect(result.current.collection.types["B738"]?.count).toBe(1);
    rerender({ a: null });
    rerender({ a: ac({ gs: 310 }) });
    expect(result.current.collection.types["B738"]?.count).toBe(1);
    rerender({ a: ac({ hex: "def456", registration: "N2" }) });
    expect(result.current.collection.types["B738"]?.count).toBe(2);
    const stored = JSON.parse(
      localStorage.getItem(COLLECTION_KEY)!,
    ) as typeof result.current.collection;
    expect(stored.regs["N2"]?.count).toBe(1);
  });

  it("skips demo aircraft and waits until the type or registration arrives", () => {
    const { result, rerender } = renderHook(({ a }: { a: Aircraft | null }) => useCollection(a), {
      initialProps: { a: ac({ hex: "mock-1" }) },
    });
    expect(result.current.collection.types).toEqual({});
    rerender({ a: ac({ type: null, registration: null }) });
    expect(result.current.collection.types).toEqual({});
    rerender({ a: ac({ type: "A21N", registration: null }) });
    expect(Object.keys(result.current.collection.types)).toEqual(["A21N"]);
  });

  it("announces an unlocked achievement, unless messages are switched off (it is recorded either way)", () => {
    const types = ["A319", "A320", "A321", "B737", "B738"];
    const run = (announce: boolean) => {
      const { result, rerender } = renderHook(
        ({ a }: { a: Aircraft | null }) => useCollection(a, announce),
        { initialProps: { a: null as Aircraft | null } },
      );
      types.forEach((t, i) => rerender({ a: ac({ hex: "h" + i, type: t, registration: null }) }));
      return result.current.collection;
    };
    const quiet = run(false);
    expect(quiet.unlocked["types-5"]).toBeTypeOf("number");
    expect(toastMock).not.toHaveBeenCalled();

    localStorage.clear();
    run(true);
    expect(toastTitles()).toContain("Achievement: Getting started");
  });

  it("clear empties the collection, stores that, and lets the same aircraft count again", () => {
    const { result, rerender } = renderHook(({ a }: { a: Aircraft | null }) => useCollection(a), {
      initialProps: { a: ac() as Aircraft | null },
    });
    act(() => result.current.clear());
    expect(result.current.collection.types).toEqual({});
    expect(JSON.parse(localStorage.getItem(COLLECTION_KEY)!).types).toEqual({});
    rerender({ a: null });
    rerender({ a: ac() });
    expect(result.current.collection.types["B738"]?.count).toBe(1);
  });
});

describe("useAlertRules", () => {
  const ualRule = { name: "United", conditions: { callsignPrefix: "UAL" } };
  type P = { aircraft: Aircraft[]; enabled: boolean; onShow: (hex: string) => void };
  const mount = (p: Partial<P> = {}) =>
    renderHook((props: P) => useAlertRules(props), {
      initialProps: { aircraft: [], enabled: true, onShow: vi.fn(), ...p },
    });

  it("loads this browser's rules after the first render", () => {
    const rule: AlertRule = {
      id: "r1",
      name: "Mil",
      enabled: true,
      createdAt: 1,
      conditions: { military: true },
    };
    localStorage.setItem(ALERT_RULES_KEY, JSON.stringify([rule]));
    expect(mount().result.current.rules).toEqual([rule]);
  });

  it("adds, switches and removes rules, keeping storage in step", () => {
    const { result } = mount();
    let outcome = "";
    act(() => {
      outcome = result.current.add(ualRule);
    });
    expect(outcome).toBe("added");
    const id = result.current.rules[0]!.id;
    act(() => result.current.setEnabled(id, false));
    expect(JSON.parse(localStorage.getItem(ALERT_RULES_KEY)!)[0].enabled).toBe(false);
    act(() => result.current.remove(id));
    expect(result.current.rules).toEqual([]);
    expect(JSON.parse(localStorage.getItem(ALERT_RULES_KEY)!)).toEqual([]);
  });

  it("refuses a rule without conditions as invalid and the 21st rule as full", () => {
    const { result } = mount();
    act(() => {
      expect(result.current.add({ name: "Everything", conditions: {} })).toBe("invalid");
    });
    for (let i = 0; i < MAX_ALERT_RULES; i++) act(() => void result.current.add(ualRule));
    expect(result.current.rules).toHaveLength(MAX_ALERT_RULES);
    act(() => {
      expect(result.current.add(ualRule)).toBe("full");
    });
  });

  it("stays quiet about aircraft already matching, then tells about one that starts matching", () => {
    const onShow = vi.fn();
    const { result, rerender } = mount({ onShow });
    act(() => void result.current.add(ualRule));
    rerender({ aircraft: [ac({ hex: "a1" })], enabled: true, onShow });
    expect(toastMock).not.toHaveBeenCalled();

    const latest = vi.fn();
    rerender({
      aircraft: [ac({ hex: "a1" }), ac({ hex: "a2", callsign: "UAL2" })],
      enabled: true,
      onShow: latest,
    });
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastTitles()[0]).toMatch(/^United: /);
    const opts = toastMock.mock.calls[0]![1] as unknown as {
      action: { onClick: () => void };
      duration: number;
    };
    expect(opts.duration).toBe(8000);
    opts.action.onClick();
    expect(latest).toHaveBeenCalledWith("a2");
    expect(onShow).not.toHaveBeenCalled();
  });

  it("forgets what matched while alerts are off, so switching back on does not flood", () => {
    const { result, rerender } = mount();
    act(() => void result.current.add(ualRule));
    const onShow = vi.fn();
    rerender({ aircraft: [], enabled: true, onShow });
    rerender({ aircraft: [ac({ hex: "a1" })], enabled: false, onShow });
    rerender({ aircraft: [ac({ hex: "a1" }), ac({ hex: "a2" })], enabled: true, onShow });
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe("useWatchAlerts", () => {
  type P = {
    aircraft: Aircraft[];
    watch: WatchItem[];
    enabled: boolean;
    onShow: (h: string) => void;
  };
  const flight: WatchItem = { kind: "flight", key: "UAL1", label: "UAL1", addedAt: 1 };
  const airport: WatchItem = { kind: "airport", key: "KJFK", label: "JFK", addedAt: 1 };
  const mount = (p: Partial<P>) =>
    renderHook((props: P) => useWatchAlerts(props), {
      initialProps: { aircraft: [], watch: [flight], enabled: true, onShow: vi.fn(), ...p },
    });

  it("shows an emergency squawk of a watched flight as an error with a Show button", () => {
    const onShow = vi.fn();
    const { rerender } = mount({ onShow });
    rerender({ aircraft: [ac({ squawk: "7700" })], watch: [flight], enabled: true, onShow });
    expect(toastError).toHaveBeenCalledTimes(1);
    const [title, opts] = toastError.mock.calls[0]! as unknown as [
      string,
      { action: { onClick: () => void }; duration: number },
    ];
    expect(title).toMatch(/squawking/);
    expect(opts.duration).toBe(15_000);
    opts.action.onClick();
    expect(onShow).toHaveBeenCalledWith("abc123");
  });

  it("confirms a takeoff over two updates before saying so", () => {
    const onShow = vi.fn();
    const { rerender } = mount({ onShow });
    const step = (onGround: boolean) =>
      rerender({ aircraft: [ac({ onGround })], watch: [flight], enabled: true, onShow });
    step(true);
    step(false);
    expect(toastMock).not.toHaveBeenCalled();
    step(false);
    expect(toastTitles()).toEqual([expect.stringMatching(/took off$/)]);
  });

  it("watches traffic near a watched airport and loads the larger airport list for it", () => {
    const { rerender } = mount({ watch: [airport] });
    expect(vi.mocked(loadLargeAirports)).toHaveBeenCalledTimes(1);
    const near = (onGround: boolean) =>
      ac({ hex: "zz9", callsign: "DAL5", lat: 40.65, lon: -73.79, onGround });
    const step = (onGround: boolean) =>
      rerender({ aircraft: [near(onGround)], watch: [airport], enabled: true, onShow: vi.fn() });
    step(false);
    step(true);
    step(true);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect((toastMock.mock.calls[0]![1] as { description: string }).description).toBe("Near JFK");
  });

  it("does not load the airport list when no airport is watched or it is already loaded", () => {
    mount({ watch: [flight] });
    vi.mocked(isLargeLoaded).mockReturnValueOnce(true);
    mount({ watch: [airport] });
    expect(vi.mocked(loadLargeAirports)).not.toHaveBeenCalled();
  });

  it("is silent while alerts are off or nothing is watched", () => {
    const { rerender } = mount({ enabled: false });
    rerender({
      aircraft: [ac({ squawk: "7700" })],
      watch: [flight],
      enabled: false,
      onShow: vi.fn(),
    });
    rerender({ aircraft: [ac({ squawk: "7700" })], watch: [], enabled: true, onShow: vi.fn() });
    expect(toastError).not.toHaveBeenCalled();
  });
});
