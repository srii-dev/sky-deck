import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { cleanAnswer } from "./acars-ai";
import { AiUnavailableError } from "./ai-service";
import { getAiService } from "./ai.server";
import { FLIGHT_AI_MAX_CHARS, MAX_FACTS_INPUT, flightBriefPrompt } from "./flight-ai";
import { createKeyedLimiter, visitorKey } from "./rate-limit";

/*
 * On-demand AI flight brief (Phase 14c). The browser sends the fact summary of the selected flight (plain text
 * made from the public live feed and route data, no ACARS text, no personal data); the server rewrites it with
 * Workers AI, then Gemini. Nothing is stored or logged. Inputs are capped and each visitor is rate limited.
 */

const limiter = createKeyedLimiter({ max: 8, windowMs: 60_000 });

const input = z.object({
  facts: z.string().trim().min(10).max(MAX_FACTS_INPUT),
});

export type FlightAiOutcome =
  { ok: true; text: string; provider: string } | { ok: false; error: string };

export const explainFlight = createServerFn({ method: "POST" })
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<FlightAiOutcome> => {
    setResponseHeader("Cache-Control", "no-store");
    if (!limiter.allow(visitorKey(getRequestHeader), Date.now()).ok) {
      return { ok: false, error: "Too many AI requests. Wait a moment." };
    }
    const ai = getAiService();
    if (!ai) return { ok: false, error: "AI is not set up on this server." };
    try {
      const res = await ai.generate({
        task: "flight-brief",
        prompt: flightBriefPrompt(data.facts),
        maxOutputChars: FLIGHT_AI_MAX_CHARS + 200,
      });
      return {
        ok: true,
        text: cleanAnswer(res.text, FLIGHT_AI_MAX_CHARS),
        provider: res.provider,
      };
    } catch (e) {
      if (e instanceof AiUnavailableError) return { ok: false, error: e.message };
      return { ok: false, error: "AI description unavailable." };
    }
  });
