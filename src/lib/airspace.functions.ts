import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { loadAirspace, type AirspaceResult } from "./airspace-sources";

/*
 * Server proxy for the airspace map layers (Phase 8d): the browser asks us, we ask the FAA once per rounded
 * box and keep the answer for 12 hours.
 */

const input = z.object({
  layer: z.enum(["class", "special"]),
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
});

export const getAirspace = createServerFn({ method: "GET" })
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<AirspaceResult | null> => {
    setResponseHeader("Cache-Control", "public, max-age=3600");
    const { layer, ...box } = data;
    return loadAirspace(layer, box);
  });
