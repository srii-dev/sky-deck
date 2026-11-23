import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { cleanAnswer } from "./acars-ai";
import { AIRPORT_AI_MAX_CHARS, MAX_BRIEF_INPUT, airportBriefPrompt } from "./airport-ai";
import { AiUnavailableError } from "./ai-service";
import { getAiService } from "./ai.server";
import { createKeyedLimiter, visitorKey } from "./rate-limit";

/*
 * On-demand AI airport brief (Phase 14c). The browser sends the rule-based brief it already shows (plain text
 * made from public weather and FAA data, no personal data); the server rewrites it with Workers AI, then Gemini.
 * Nothing is stored or logged. Inputs are capped and each visitor is rate limited.
 */

const limiter = createKeyedLimiter({ max: 8, windowMs: 60_000 });

const input = z.object({
  icao: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,4}$/),
  name: z.string().trim().max(120),
  brief: z.string().trim().min(10).max(MAX_BRIEF_INPUT),
});

export type AirportAiOutcome =
  { ok: true; text: string; provider: string } | { ok: false; error: string };

export const explainAirport = createServerFn({ method: "POST" })
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<AirportAiOutcome> => {
    setResponseHeader("Cache-Control", "no-store");
    if (!limiter.allow(visitorKey(getRequestHeader), Date.now()).ok) {
      return { ok: false, error: "Too many AI requests. Wait a moment." };
    }
    const ai = getAiService();
    if (!ai) return { ok: false, error: "AI is not set up on this server." };
    try {
      const res = await ai.generate({
        task: "airport-brief",
        prompt: airportBriefPrompt(data.name, data.icao, data.brief),
        maxOutputChars: AIRPORT_AI_MAX_CHARS + 200,
      });
      return {
        ok: true,
        text: cleanAnswer(res.text, AIRPORT_AI_MAX_CHARS),
        provider: res.provider,
      };
    } catch (e) {
      if (e instanceof AiUnavailableError) return { ok: false, error: e.message };
      return { ok: false, error: "AI description unavailable." };
    }
  });
