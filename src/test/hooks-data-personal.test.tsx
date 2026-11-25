import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthApi } from "@/hooks/use-auth";
import { usePersonalData, watchlistFullNotice } from "@/hooks/use-personal-data";
import {
  clearRecentFlightsInCloud,
  deleteWatchItem,
  fetchCloudLists,
  upsertRecentFlights,
  upsertWatchItems,
} from "@/lib/cloud-data";
import { getSupabase } from "@/lib/supabase-client";
import {
  MAX_WATCH_ITEMS,
  RECENT_FLIGHTS_KEY,
  WATCHLIST_KEY,
  loadWatchlist,
  type RecentFlight,
  type WatchItem,
} from "@/lib/watchlist";

vi.mock("@/lib/supabase-client", () => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/cloud-data", () => ({
  fetchCloudLists: vi.fn(),
  upsertWatchItems: vi.fn(),
  upsertRecentFlights: vi.fn(),
  deleteWatchItem: vi.fn(),
  clearRecentFlightsInCloud: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

const SB = { fake: "supabase" } as unknown as NonNullable<Awaited<ReturnType<typeof getSupabase>>>;

const auth = (status: AuthApi["status"], userId: string | null = null): AuthApi => ({
  status,
  userId,
  email: userId ? "pilot@example.com" : null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
});

/** A valid flight item: callsigns are 3 to 10 letters or digits. */
const flight = (n: number, addedAt: number): WatchItem => ({
  kind: "flight",
  key: `TST${n}`,
  label: `TST${n}`,
  addedAt,
});
const recentOf = (hex: string, viewedAt: number): RecentFlight => ({
  hex,
  callsign: null,
  registration: null,
  type: null,
  viewedAt,
});

function render(initial: AuthApi) {
  return renderHook(({ a }: { a: AuthApi }) => usePersonalData(a), {
    initialProps: { a: initial },
  });
}

/** Signs in and waits until the first merge has finished. */
async function signedIn(remote: { watch: WatchItem[]; recent: RecentFlight[] }) {
  vi.mocked(fetchCloudLists).mockResolvedValue({ ok: true, data: remote });
  const hook = render(auth("signed-in", "user-1"));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(getSupabase).mockResolvedValue(SB);
  vi.mocked(upsertWatchItems).mockResolvedValue(true);
  vi.mocked(upsertRecentFlights).mockResolvedValue(true);
  vi.mocked(deleteWatchItem).mockResolvedValue(true);
  vi.mocked(clearRecentFlightsInCloud).mockResolvedValue(true);
});

describe("usePersonalData in this browser only", () => {
  it("reads the lists from storage after mounting and never talks to the account", async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 100)]));
    localStorage.setItem(RECENT_FLIGHTS_KEY, JSON.stringify([recentOf("abc123", 50)]));
    const { result } = render(auth("signed-out"));
    await waitFor(() => expect(result.current.watch).toHaveLength(1));
    expect(result.current.recent.map((r) => r.hex)).toEqual(["abc123"]);
    expect(result.current.sync).toBe("off");
    expect(result.current.isWatching("flight", "tst1")).toBe(true);

    act(() => void result.current.toggleWatch("aircraft", "ABC123", "N1"));
    act(() =>
      result.current.addRecent({ hex: "def456", callsign: "X1", registration: null, type: null }),
    );
    expect(loadWatchlist().map((w) => w.key)).toEqual(["abc123", "TST1"]);
    expect(getSupabase).not.toHaveBeenCalled();
    expect(upsertWatchItems).not.toHaveBeenCalled();
    expect(upsertRecentFlights).not.toHaveBeenCalled();
  });

  it("toggles an item on and off, and rejects invalid keys", async () => {
    const { result } = render(auth("signed-out"));
    let r = "";
    act(() => void (r = result.current.toggleWatch("airport", "kjfk", "JFK")));
    expect(r).toBe("added");
    expect(result.current.watch[0]).toMatchObject({ kind: "airport", key: "KJFK", label: "JFK" });
    act(() => void (r = result.current.toggleWatch("airport", "KJFK", "JFK")));
    expect(r).toBe("removed");
    expect(result.current.watch).toEqual([]);
    act(() => void (r = result.current.toggleWatch("aircraft", "not-hex", "?")));
    expect(r).toBe("invalid");
  });

  it("says the list is full at 50 items instead of adding a 51st", async () => {
    const full = Array.from({ length: MAX_WATCH_ITEMS }, (_, i) => flight(i, 1000 + i));
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(full));
    const { result } = render(auth("signed-out"));
    await waitFor(() => expect(result.current.watch).toHaveLength(MAX_WATCH_ITEMS));
    let r = "";
    act(() => void (r = result.current.toggleWatch("flight", "NEW1", "NEW1")));
    expect(r).toBe("full");
    expect(result.current.watch).toHaveLength(MAX_WATCH_ITEMS);
  });

  it("reload re-reads storage, for example after the saved data was deleted", async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 100)]));
    const { result } = render(auth("signed-out"));
    await waitFor(() => expect(result.current.watch).toHaveLength(1));
    localStorage.clear();
    act(() => result.current.reload());
    expect(result.current.watch).toEqual([]);
  });
});

describe("usePersonalData sign-in merge", () => {
  it("unites both lists once, keeps them here and uploads only what the account lacks", async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 300), flight(2, 200)]));
    localStorage.setItem(RECENT_FLIGHTS_KEY, JSON.stringify([recentOf("aaa111", 500)]));
    const { result, rerender } = await signedIn({
      watch: [flight(2, 250), flight(3, 100)],
      recent: [recentOf("bbb222", 400)],
    });
    expect(result.current.watch.map((w) => w.key)).toEqual(["TST1", "TST2", "TST3"]);
    // The earlier "added on" date wins for an item both sides had.
    expect(result.current.watch[1]!.addedAt).toBe(200);
    expect(loadWatchlist()).toHaveLength(3);
    expect(vi.mocked(upsertWatchItems).mock.calls[0]![2].map((w) => w.key)).toEqual(["TST1"]);
    expect(vi.mocked(upsertRecentFlights).mock.calls[0]![2].map((r) => r.hex)).toEqual(["aaa111"]);
    expect(result.current.recent.map((r) => r.hex)).toEqual(["aaa111", "bbb222"]);

    // A re-render for the same user does not merge again.
    rerender({ a: auth("signed-in", "user-1") });
    await act(async () => {});
    expect(fetchCloudLists).toHaveBeenCalledTimes(1);
  });

  it("uploads only what fits when the account is nearly full, and tells the visitor about the rest", async () => {
    // 48 in the account, 5 new ones here: the database refuses any insert past 50, so a single upload of all five
    // would fail as a whole. Only the two newest go up; the other three are named in a notice.
    const remote = Array.from({ length: 48 }, (_, i) => flight(100 + i, 1000 + i));
    const local = Array.from({ length: 5 }, (_, i) => flight(i, 5000 + i));
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(local));
    const { result } = await signedIn({ watch: remote, recent: [] });

    const uploaded = vi.mocked(upsertWatchItems).mock.calls[0]![2];
    expect(uploaded.map((w) => w.key)).toEqual(["TST4", "TST3"]);
    expect(result.current.sync).toBe("synced");
    expect(result.current.watch).toHaveLength(MAX_WATCH_ITEMS);
    expect(result.current.isWatching("flight", "TST2")).toBe(false);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [title, opts] = vi.mocked(toast.warning).mock.calls[0]! as [
      string,
      { description: string },
    ];
    expect(title).toContain("full (50 items)");
    expect(opts.description).toContain("3 items from this browser did not fit");
    expect(opts.description).toContain("TST2, TST1, TST0");
  });

  it("uploads nothing and warns when the account is already full", async () => {
    const remote = Array.from({ length: 50 }, (_, i) => flight(100 + i, 1000 + i));
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 9000)]));
    const { result } = await signedIn({ watch: remote, recent: [] });
    expect(vi.mocked(upsertWatchItems).mock.calls[0]![2]).toEqual([]);
    expect(result.current.isWatching("flight", "TST1")).toBe(false);
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("does not warn when everything fits", async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 9000)]));
    await signedIn({ watch: [flight(2, 100)], recent: [] });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("shows an error and keeps this browser's lists when the account cannot be read", async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 100)]));
    vi.mocked(fetchCloudLists).mockResolvedValue({ ok: false, data: { watch: [], recent: [] } });
    const { result } = render(auth("signed-in", "user-1"));
    await waitFor(() => expect(result.current.sync).toBe("error"));
    expect(result.current.watch.map((w) => w.key)).toEqual(["TST1"]);
    expect(upsertWatchItems).not.toHaveBeenCalled();
    // Not synced, so later changes stay on this device.
    act(() => void result.current.toggleWatch("flight", "TST9", "TST9"));
    await act(async () => {});
    expect(upsertWatchItems).not.toHaveBeenCalled();
  });

  it("shows an error when an upload fails", async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 100)]));
    vi.mocked(upsertWatchItems).mockResolvedValue(false);
    vi.mocked(fetchCloudLists).mockResolvedValue({ ok: true, data: { watch: [], recent: [] } });
    const { result } = render(auth("signed-in", "user-1"));
    await waitFor(() => expect(result.current.sync).toBe("error"));
  });

  it("drops a merge that finishes after the visitor signed out", async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([flight(1, 100)]));
    let answer!: (v: Awaited<ReturnType<typeof fetchCloudLists>>) => void;
    vi.mocked(fetchCloudLists).mockReturnValue(new Promise((r) => (answer = r)));
    const { result, rerender } = render(auth("signed-in", "user-1"));
    await waitFor(() => expect(result.current.sync).toBe("syncing"));
    rerender({ a: auth("signed-out") });
    expect(result.current.sync).toBe("off");
    await act(async () => answer({ ok: true, data: { watch: [flight(7, 50)], recent: [] } }));
    expect(result.current.watch.map((w) => w.key)).toEqual(["TST1"]);
    expect(upsertWatchItems).not.toHaveBeenCalled();
  });

  it("merges again for the next sign-in after signing out", async () => {
    const { rerender } = await signedIn({ watch: [], recent: [] });
    rerender({ a: auth("signed-out") });
    rerender({ a: auth("signed-in", "user-1") });
    await waitFor(() => expect(fetchCloudLists).toHaveBeenCalledTimes(2));
  });
});

describe("usePersonalData while signed in", () => {
  it("writes each change to the account as well", async () => {
    const { result } = await signedIn({ watch: [], recent: [] });
    vi.mocked(upsertWatchItems).mockClear();
    vi.mocked(upsertRecentFlights).mockClear();

    act(() => void result.current.toggleWatch("aircraft", "ABC123", "N1"));
    await waitFor(() => expect(upsertWatchItems).toHaveBeenCalledTimes(1));
    expect(vi.mocked(upsertWatchItems).mock.calls[0]!.slice(1, 2)).toEqual(["user-1"]);
    expect(vi.mocked(upsertWatchItems).mock.calls[0]![2]).toMatchObject([{ key: "abc123" }]);

    act(() => void result.current.toggleWatch("aircraft", "ABC123", "N1"));
    await waitFor(() => expect(deleteWatchItem).toHaveBeenCalledWith(SB, "aircraft", "abc123"));

    act(() => void result.current.toggleWatch("airport", "kjfk", "JFK"));
    act(() => result.current.removeWatchItem("airport", "KJFK"));
    await waitFor(() => expect(deleteWatchItem).toHaveBeenCalledWith(SB, "airport", "KJFK"));

    act(() =>
      result.current.addRecent({ hex: "DEF456", callsign: "X1", registration: null, type: null }),
    );
    await waitFor(() => expect(upsertRecentFlights).toHaveBeenCalledTimes(1));
    expect(vi.mocked(upsertRecentFlights).mock.calls[0]![2]).toMatchObject([{ hex: "def456" }]);

    act(() => result.current.clearRecent());
    await waitFor(() => expect(clearRecentFlightsInCloud).toHaveBeenCalledWith(SB));
    expect(result.current.recent).toEqual([]);
    expect(result.current.sync).toBe("synced");
  });

  it("marks the sync as failed when a save is refused, but keeps the change here", async () => {
    const { result } = await signedIn({ watch: [], recent: [] });
    vi.mocked(upsertWatchItems).mockResolvedValue(false);
    act(() => void result.current.toggleWatch("flight", "UAL1", "UAL1"));
    await waitFor(() => expect(result.current.sync).toBe("error"));
    expect(loadWatchlist().map((w) => w.key)).toEqual(["UAL1"]);
  });

  it("stops writing to the account after sign-out", async () => {
    const { result, rerender } = await signedIn({ watch: [], recent: [] });
    vi.mocked(upsertWatchItems).mockClear();
    rerender({ a: auth("signed-out") });
    act(() => void result.current.toggleWatch("flight", "UAL1", "UAL1"));
    await act(async () => {});
    expect(upsertWatchItems).not.toHaveBeenCalled();
    expect(result.current.sync).toBe("off");
  });
});

describe("watchlistFullNotice", () => {
  it("names one item in the singular", () => {
    const [title, opts] = watchlistFullNotice([flight(1, 1)]);
    expect(title).toBe("Your account's watchlist is full (50 items)");
    expect(opts.description).toBe(
      "1 item from this browser did not fit and was left out: TST1. Remove some and add them again.",
    );
  });

  it("names the first three and counts the rest", () => {
    const [, opts] = watchlistFullNotice([1, 2, 3, 4, 5].map((n) => flight(n, n)));
    expect(opts.description).toContain("5 items from this browser did not fit and were left out");
    expect(opts.description).toContain("TST1, TST2, TST3 and 2 more.");
  });
});
