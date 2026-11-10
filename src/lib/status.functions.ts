import { createServerFn } from "@tanstack/react-start";

import type { StatusReport } from "./status-probes";

/*
 * Whether the outside services answer (Phase 23d). The probes are asked at most once a minute per server instance
 * and the answer is shared by everyone, so a busy status page cannot hammer the providers. Nothing here is secret:
 * only names, states and timings leave the server (the anon key is used to ask, never returned).
 */
const CACHE_MS = 60_000;
let cached: { at: number; report: StatusReport } | null = null;
let inflight: Promise<StatusReport> | null = null;

export const getStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<StatusReport> => {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_MS) return cached.report;
    if (!inflight) {
      inflight = (async () => {
        const { runAllProbes } = await import("./status-probes");
        const report = await runAllProbes(
          process.env as Record<string, string | undefined>,
          (url, init) => fetch(url, { ...init, redirect: "follow" }),
        );
        cached = { at: Date.now(), report };
        return report;
      })().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  },
);
