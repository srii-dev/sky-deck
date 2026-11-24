import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createKeyedLimiter, visitorKey } from "./rate-limit";
import {
  loadAdvisories,
  loadPireps,
  type AdvisoryResult,
  type PirepResult,
} from "./weather-sources";

// Per Worker instance (shortcut: move to a Durable Object when abuse appears).
const limiter = createKeyedLimiter({ max: 30, windowMs: 60_000 });

/*
 * Server proxy for the weather map layers (Phase 7e). The browser never calls aviationweather.gov directly.
 */

export const getAdvisories = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdvisoryResult> => {
    const result = await loadAdvisories();
    // Never let a browser keep a partial answer.
    setResponseHeader("Cache-Control", result.failed.length ? "no-store" : "public, max-age=120");
    return result;
  },
);

const boxInput = z.object({
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
});

export const getPireps = createServerFn({ method: "GET" })
  .validator((d: unknown) => boxInput.parse(d))
  .handler(async ({ data }): Promise<PirepResult | null> => {
    if (!limiter.allow(visitorKey(getRequestHeader), Date.now()).ok) {
      setResponseHeader("Cache-Control", "no-store");
      return null;
    }
    setResponseHeader("Cache-Control", "public, max-age=60");
    return loadPireps(data);
  });
