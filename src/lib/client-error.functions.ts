import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cleanClientError, createReportLimiter } from "./client-error";

/*
 * Receives browser error reports and writes ONE structured log line per report ("[client-error]").
 * On the hosting platform's log view this is the error inbox. Nothing is stored by the app.
 * Limits: input sizes are capped, and each server instance accepts at most 20 reports a minute.
 */

const limiter = createReportLimiter(20, 60_000);

const reportInput = z.object({
  message: z.string().max(2000),
  stack: z.string().max(10_000).optional(),
  boundary: z.string().max(200).optional(),
  path: z.string().max(500).optional(),
});

export const reportClientErrorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => reportInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!limiter.allow(Date.now())) return { ok: false };
    const report = cleanClientError(data);
    // JSON.stringify keeps one report on one line, so a crafted message cannot fake log lines.
    console.error("[client-error]", JSON.stringify(report));
    return { ok: true };
  });
