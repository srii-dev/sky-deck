import { afterEach, describe, expect, it } from "vitest";
import { parseAtis } from "@/lib/airport-data";
import {
  ATIS_NONE_TTL_MS,
  ATIS_TTL_MS,
  loadAirportAtis,
  resetAirportSourceState,
} from "@/lib/airport-sources";

afterEach(() => resetAirportSourceState());

// Shape copied from a real atis.info answer received on 2026-11-08 (text shortened).
const KJFK = [
  {
    airport: "KJFK",
    type: "combined",
    code: "C",
    datis:
      "JFK ATIS INFO C 1751Z. 28017KT 10SM FEW040 16/06 A2982. APPROACH IN USE ILS RY 31R. ...ADVS YOU HAVE INFO C.",
    time: "1751",
    updatedAt: "2026-11-08T18:08:11.6754133Z",
  },
];

describe("parseAtis", () => {
  it("reads a combined report", () => {
    const [r] = parseAtis(KJFK);
    expect(r?.kind).toBe("combined");
    expect(r?.code).toBe("C");
    expect(r?.time).toBe("1751");
    expect(r?.text).toContain("APPROACH IN USE");
    expect(r?.updatedAt).toBe(Date.parse("2026-11-08T18:08:11.6754133Z"));
  });

  it("reads separate arrival and departure reports", () => {
    const rows = parseAtis([
      { type: "arr", code: "L", datis: "MIA ARR INFO L 1553Z.", time: "1553" },
      { type: "dep", code: "M", datis: "MIA DEP INFO M 1553Z.", time: "1553" },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["arrival", "departure"]);
  });

  it("gives nothing for the error object, empty or malformed data", () => {
    expect(parseAtis({ error: "No results found" })).toEqual([]);
    expect(parseAtis([])).toEqual([]);
    expect(parseAtis(null)).toEqual([]);
    expect(parseAtis([{ type: "combined", datis: "   " }, 7, null])).toEqual([]);
  });

  it("keeps missing fields null and caps very long text", () => {
    const [r] = parseAtis([{ datis: "X".repeat(9000) }]);
    expect(r?.code).toBeNull();
    expect(r?.time).toBeNull();
    expect(r?.updatedAt).toBeNull();
    expect(r?.text.length).toBe(4000);
  });
});

function makeFetch(make: () => Response) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return make();
  }) as typeof fetch;
  return { impl, calls };
}

describe("loadAirportAtis", () => {
  it("loads and parses the report, calling the atis.info API with the ICAO code", async () => {
    const { impl, calls } = makeFetch(() => new Response(JSON.stringify(KJFK)));
    const res = await loadAirportAtis("kjfk", { fetchImpl: impl });
    expect(res.icao).toBe("KJFK");
    expect(res.atis).toHaveLength(1);
    expect(calls).toEqual(["https://atis.info/api/KJFK"]);
  });

  it("treats a 404 as no D-ATIS, not as a failure", async () => {
    const { impl } = makeFetch(() => new Response('{"error":"No results found"}', { status: 404 }));
    const res = await loadAirportAtis("KPAO", { fetchImpl: impl });
    expect(res.atis).toEqual([]);
  });

  it("reports a failure as null, without retrying", async () => {
    const { impl, calls } = makeFetch(() => new Response("down", { status: 503 }));
    const res = await loadAirportAtis("KJFK", { fetchImpl: impl });
    expect(res.atis).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("reports unreadable JSON as a failure", async () => {
    const { impl } = makeFetch(() => new Response("<html>oops</html>"));
    expect((await loadAirportAtis("KJFK", { fetchImpl: impl })).atis).toBeNull();
  });

  it("caches a report briefly and a 'none' answer for longer; failures are not cached", async () => {
    const t = 1_000_000;
    const ok = makeFetch(() => new Response(JSON.stringify(KJFK)));
    await loadAirportAtis("KJFK", { fetchImpl: ok.impl, now: () => t });
    await loadAirportAtis("KJFK", { fetchImpl: ok.impl, now: () => t + ATIS_TTL_MS - 1 });
    expect(ok.calls).toHaveLength(1);
    await loadAirportAtis("KJFK", { fetchImpl: ok.impl, now: () => t + ATIS_TTL_MS + 1 });
    expect(ok.calls).toHaveLength(2);

    const none = makeFetch(() => new Response("{}", { status: 404 }));
    await loadAirportAtis("KPAO", { fetchImpl: none.impl, now: () => t });
    await loadAirportAtis("KPAO", { fetchImpl: none.impl, now: () => t + ATIS_TTL_MS + 1 });
    expect(none.calls).toHaveLength(1);
    await loadAirportAtis("KPAO", { fetchImpl: none.impl, now: () => t + ATIS_NONE_TTL_MS + 1 });
    expect(none.calls).toHaveLength(2);

    const bad = makeFetch(() => new Response("x", { status: 500 }));
    await loadAirportAtis("KORD", { fetchImpl: bad.impl, now: () => t });
    await loadAirportAtis("KORD", { fetchImpl: bad.impl, now: () => t });
    expect(bad.calls).toHaveLength(2);
  });
});
