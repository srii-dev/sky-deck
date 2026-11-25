import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRecentFlightsInCloud,
  deleteWatchItem,
  fetchCloudLists,
  upsertRecentFlights,
  upsertWatchItems,
} from "@/lib/cloud-data";

vi.mock("@/lib/auth-config.functions", () => ({ getAuthConfig: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ client: true })) }));

type Result = { data?: unknown; error: unknown };

/** A query builder that records every call and resolves to the answer given for its table. */
function fakeSb(answers: Record<string, Result | Error>) {
  const log: { table: string; calls: [string, unknown[]][] }[] = [];
  const sb = {
    from(table: string) {
      const entry = { table, calls: [] as [string, unknown[]][] };
      log.push(entry);
      const answer = answers[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        then(ok: (v: Result) => unknown, bad: (e: unknown) => unknown) {
          return answer instanceof Error
            ? Promise.reject(answer).then(ok, bad)
            : Promise.resolve(answer).then(ok, bad);
        },
      };
      for (const m of ["select", "order", "limit", "upsert", "delete", "eq", "neq"]) {
        builder[m] = (...args: unknown[]) => {
          entry.calls.push([m, args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { sb: sb as unknown as SupabaseClient, log };
}

describe("fetchCloudLists", () => {
  it("reads the newest 50 watch items and 15 recent flights, cleaned like local data", async () => {
    const { sb, log } = fakeSb({
      watchlist_items: {
        data: [
          { kind: "flight", key: "ual1", label: "United 1", added_at: "2026-11-01T00:00:00Z" },
          { kind: "bogus", key: "x", label: "x", added_at: "2026-11-01T00:00:00Z" },
          { kind: "airport", key: "KJFK", label: "JFK", added_at: "not a date" },
        ],
        error: null,
      },
      recent_flights: {
        data: [
          {
            hex: "ABC123",
            callsign: "UAL1",
            registration: null,
            type: "B738",
            viewed_at: "2026-11-02T00:00:00Z",
          },
          { hex: "zzz", callsign: null, registration: null, type: null, viewed_at: null },
        ],
        error: null,
      },
    });
    const r = await fetchCloudLists(sb);
    expect(r.ok).toBe(true);
    expect(r.data.watch).toEqual([
      {
        kind: "flight",
        key: "UAL1",
        label: "United 1",
        addedAt: Date.parse("2026-11-01T00:00:00Z"),
      },
      { kind: "airport", key: "KJFK", label: "JFK", addedAt: 0 },
    ]);
    expect(r.data.recent).toEqual([
      {
        hex: "abc123",
        callsign: "UAL1",
        registration: null,
        type: "B738",
        viewedAt: Date.parse("2026-11-02T00:00:00Z"),
      },
    ]);
    const w = log.find((l) => l.table === "watchlist_items")!.calls;
    expect(w).toContainEqual(["order", ["added_at", { ascending: false }]]);
    expect(w).toContainEqual(["limit", [50]]);
    expect(log.find((l) => l.table === "recent_flights")!.calls).toContainEqual(["limit", [15]]);
  });

  it("treats missing rows as empty lists", async () => {
    const { sb } = fakeSb({
      watchlist_items: { data: null, error: null },
      recent_flights: { data: null, error: null },
    });
    expect(await fetchCloudLists(sb)).toEqual({ ok: true, data: { watch: [], recent: [] } });
  });

  it("fails without throwing when either table answers with an error", async () => {
    const { sb } = fakeSb({ recent_flights: { data: null, error: { message: "denied" } } });
    expect(await fetchCloudLists(sb)).toEqual({ ok: false, data: { watch: [], recent: [] } });
  });

  it("fails without throwing when the request itself throws", async () => {
    const { sb } = fakeSb({ watchlist_items: new Error("offline") });
    expect((await fetchCloudLists(sb)).ok).toBe(false);
  });
});

describe("saving to the account", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("skips the request for an empty upload", async () => {
    const { sb, log } = fakeSb({});
    expect(await upsertWatchItems(sb, "u1", [])).toBe(true);
    expect(await upsertRecentFlights(sb, "u1", [])).toBe(true);
    expect(log).toEqual([]);
  });

  it("upserts watch items for the user, on their natural key", async () => {
    const { sb, log } = fakeSb({});
    const ok = await upsertWatchItems(sb, "u1", [
      { kind: "flight", key: "UAL1", label: "UAL1", addedAt: Date.parse("2026-11-01T00:00:00Z") },
      { kind: "airport", key: "KJFK", label: "JFK", addedAt: 0 },
    ]);
    expect(ok).toBe(true);
    expect(log[0]!.table).toBe("watchlist_items");
    expect(log[0]!.calls[0]).toEqual([
      "upsert",
      [
        [
          {
            user_id: "u1",
            kind: "flight",
            key: "UAL1",
            label: "UAL1",
            added_at: "2026-11-01T00:00:00.000Z",
          },
          // An unknown "added on" time becomes now, not 1970.
          {
            user_id: "u1",
            kind: "airport",
            key: "KJFK",
            label: "JFK",
            added_at: "2026-11-25T10:00:00.000Z",
          },
        ],
        { onConflict: "user_id,kind,key" },
      ],
    ]);
  });

  it("upserts recent flights for the user, one row per airframe", async () => {
    const { sb, log } = fakeSb({});
    await upsertRecentFlights(sb, "u1", [
      { hex: "abc123", callsign: "UAL1", registration: "N1", type: "B738", viewedAt: 0 },
    ]);
    expect(log[0]!.calls[0]).toEqual([
      "upsert",
      [
        [
          {
            user_id: "u1",
            hex: "abc123",
            callsign: "UAL1",
            registration: "N1",
            type: "B738",
            viewed_at: "2026-11-25T10:00:00.000Z",
          },
        ],
        { onConflict: "user_id,hex" },
      ],
    ]);
  });

  it("reports a refused or failed save as false instead of throwing", async () => {
    const item = { kind: "flight" as const, key: "UAL1", label: "UAL1", addedAt: 1 };
    const recent = { hex: "abc123", callsign: null, registration: null, type: null, viewedAt: 1 };
    const refused = fakeSb({
      watchlist_items: { error: { message: "watchlist is full (50 items)" } },
      recent_flights: { error: { message: "denied" } },
    }).sb;
    expect(await upsertWatchItems(refused, "u1", [item])).toBe(false);
    expect(await upsertRecentFlights(refused, "u1", [recent])).toBe(false);
    expect(await deleteWatchItem(refused, "flight", "UAL1")).toBe(false);
    expect(await clearRecentFlightsInCloud(refused)).toBe(false);

    const offline = fakeSb({
      watchlist_items: new Error("offline"),
      recent_flights: new Error("offline"),
    }).sb;
    expect(await upsertWatchItems(offline, "u1", [item])).toBe(false);
    expect(await upsertRecentFlights(offline, "u1", [recent])).toBe(false);
    expect(await deleteWatchItem(offline, "flight", "UAL1")).toBe(false);
    expect(await clearRecentFlightsInCloud(offline)).toBe(false);
  });

  it("deletes one watch item by kind and key", async () => {
    const { sb, log } = fakeSb({});
    expect(await deleteWatchItem(sb, "aircraft", "abc123")).toBe(true);
    expect(log[0]!.calls).toEqual([
      ["delete", []],
      ["eq", ["kind", "aircraft"]],
      ["eq", ["key", "abc123"]],
    ]);
  });

  it("clears all recent flights with a filter that matches every row", async () => {
    const { sb, log } = fakeSb({});
    expect(await clearRecentFlightsInCloud(sb)).toBe(true);
    expect(log[0]!.table).toBe("recent_flights");
    expect(log[0]!.calls).toEqual([
      ["delete", []],
      ["neq", ["hex", ""]],
    ]);
  });
});
