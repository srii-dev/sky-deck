import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { loadAirportBrief, type AirportBrief } from "./airport-sources";

/*
 * Server proxy for airport pages (Phase 4). The browser never calls aviationweather.gov or the FAA
 * directly: neither promises CORS headers, and provider changes stay in airport-sources.ts.
 */

const input = z.object({
  icao: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,4}$/),
  iata: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3}$/)
    .nullable(),
});

export const getAirportBrief = createServerFn({ method: "GET" })
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<AirportBrief> => {
    const brief = await loadAirportBrief(data.icao, data.iata);
    // Weather changes slowly: let browsers keep a complete answer briefly, but never a partial one.
    setResponseHeader("Cache-Control", brief.failed.length ? "no-store" : "public, max-age=60");
    return brief;
  });
