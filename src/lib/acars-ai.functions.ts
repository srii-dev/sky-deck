import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  BRIEF_MAX_CHARS,
  DETAIL_MAX_CHARS,
  MAX_BATCH,
  briefPrompt,
  cleanAnswer,
  detailPrompt,
  parseBriefs,
} from "./acars-ai";
import { AiUnavailableError } from "./ai-service";
import { getAiService } from "./ai.server";
import { createKeyedLimiter, visitorKey } from "./rate-limit";

/*
 * AI descriptions of ACARS messages (decision 2026-11-22). The browser sends message text it fetched from
 * Airframes; it passes through here to Workers AI (or Gemini) and back. Nothing is stored or logged.
 * Inputs are capped and each visitor is rate limited, so this cannot serve as a general-purpose AI proxy.
 */

const briefLimiter = createKeyedLimiter({ max: 12, windowMs: 60_000 });
const detailLimiter = createKeyedLimiter({ max: 10, windowMs: 60_000 });

const message = z.object({
  id: z.number().int().nonnegative(),
  flight: z.string().max(16).nullable(),
  tail: z.string().max(16).nullable(),
  label: z.string().max(8).nullable(),
  route: z.string().max(24).nullable(),
  sourceType: z.string().max(16).nullable(),
  text: z.string().max(1100),
});

export type AiOutcome<T> = { ok: true; value: T; provider: string } | { ok: false; error: string };

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof AiUnavailableError) return { ok: false, error: e.message };
  return { ok: false, error: "AI description unavailable." };
}

export const describeAcarsBatch = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ messages: z.array(message).min(1).max(MAX_BATCH) }).parse(d),
  )
  .handler(async ({ data }): Promise<AiOutcome<Record<number, string>>> => {
    setResponseHeader("Cache-Control", "no-store");
    if (!briefLimiter.allow(visitorKey(getRequestHeader), Date.now()).ok) {
      return { ok: false, error: "Too many AI requests. Wait a moment." };
    }
    const ai = getAiService();
    if (!ai) return { ok: false, error: "AI is not set up on this server." };
    try {
      const res = await ai.generate({
        task: "acars-brief",
        prompt: briefPrompt(data.messages),
        maxOutputChars: MAX_BATCH * (BRIEF_MAX_CHARS + 40),
      });
      const briefs = parseBriefs(
        res.text,
        data.messages.map((m) => m.id),
      );
      return { ok: true, value: briefs, provider: res.provider };
    } catch (e) {
      return failure(e);
    }
  });

export const explainAcars = createServerFn({ method: "POST" })
  .validator((d: unknown) => message.parse(d))
  .handler(async ({ data }): Promise<AiOutcome<string>> => {
    setResponseHeader("Cache-Control", "no-store");
    if (!detailLimiter.allow(visitorKey(getRequestHeader), Date.now()).ok) {
      return { ok: false, error: "Too many AI requests. Wait a moment." };
    }
    const ai = getAiService();
    if (!ai) return { ok: false, error: "AI is not set up on this server." };
    try {
      const res = await ai.generate({
        task: "acars-detail",
        prompt: detailPrompt(data),
        maxOutputChars: DETAIL_MAX_CHARS + 200,
      });
      return { ok: true, value: cleanAnswer(res.text, DETAIL_MAX_CHARS), provider: res.provider };
    } catch (e) {
      return failure(e);
    }
  });
