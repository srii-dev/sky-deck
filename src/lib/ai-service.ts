/*
 * AI service wrapper (Phase 18g). One interface over several providers, used by later features (airport brief
 * in 14c, flight summaries, and so on). Used by the ACARS descriptions (src/lib/acars-ai.functions.ts).
 *
 * Rules built in:
 *  - Fallback order: providers are tried in the order given (Gemini first, then Cloudflare Workers AI).
 *  - A daily budget per provider: a provider that used its budget is skipped until the next UTC day.
 *  - A per-minute limit per provider, and a pause after the provider itself reports a limit (until its daily reset,
 *    or a minute for a rate limit). When no provider can take a call now, it fails at once with reason "busy".
 *  - A kill switch: when `enabled()` is false nothing is generated and nothing is spent.
 *  - A cache: the same task and prompt is answered from the cache without asking a provider or spending budget.
 *  - Every answer says which provider wrote it and carries the label "AI-generated" for display.
 *  - On demand only: there is no background generation here.
 * The caller decides what may be sent. ACARS message text may be sent to Workers AI and Gemini for descriptions
 * (decision 2026-11-22, replacing the 2026-11-07 hold).
 * Budgets, pacing and cache are kept in memory of one instance. On Cloudflare that instance is the global AiHub
 * Durable Object (src/server/ai-hub.ts), so they are shared by every visitor (see src/lib/ai.server.ts).
 */

export type AiProviderName = "gemini" | "workers-ai";

export const AI_LABEL = "AI-generated";
export const MAX_PROMPT_CHARS = 8000;
export const DEFAULT_MAX_OUTPUT_CHARS = 2000;

export interface AiRequest {
  /** Names the feature, so the same prompt for two features is cached separately. */
  task: string;
  prompt: string;
  maxOutputChars?: number;
}

export interface AiProvider {
  name: AiProviderName;
  generate(prompt: string, signal?: AbortSignal): Promise<string>;
  /** When to try again after the provider said its daily allowance is used up. Default: the next 00:00 UTC. */
  dailyResetAt?(now: number): number;
}

export interface AiResult {
  text: string;
  provider: AiProviderName;
  /** True when the answer came from the cache (no provider was asked). */
  cached: boolean;
  /** Always "AI-generated": show it next to the text. */
  label: typeof AI_LABEL;
  generatedAt: number;
}

export type AiFailureReason = "disabled" | "invalid-request" | "budget" | "busy" | "all-failed";

export const AI_BUSY_MESSAGE = "AI is busy, try again in a minute.";

export class AiUnavailableError extends Error {
  readonly reason: AiFailureReason;
  constructor(reason: AiFailureReason, message: string) {
    super(message);
    this.name = "AiUnavailableError";
    this.reason = reason;
  }
}

export interface AiBudgetStore {
  used(provider: AiProviderName, day: string): number;
  add(provider: AiProviderName, day: string, count: number): void;
}

export interface CachedAnswer {
  text: string;
  provider: AiProviderName;
  generatedAt: number;
}

export interface AiCache {
  get(key: string, now: number): CachedAnswer | undefined;
  set(key: string, value: CachedAnswer, now: number): void;
}

/** A provider that reported a limit is skipped until `until`; `daily` says which kind of limit. */
export interface AiPause {
  until: number;
  daily: boolean;
}

export function createMemoryBudgetStore(): AiBudgetStore & {
  reset(): void;
  snapshot(): [string, number][];
  restore(entries: [string, number][]): void;
} {
  const counts = new Map<string, number>();
  const k = (p: string, d: string) => p + "|" + d;
  return {
    used: (p, d) => counts.get(k(p, d)) ?? 0,
    add: (p, d, n) => {
      counts.set(k(p, d), (counts.get(k(p, d)) ?? 0) + n);
      // Keep only today's and yesterday's counters; older days are never read again.
      if (counts.size > 50) {
        for (const key of counts.keys()) {
          if (!key.endsWith("|" + d)) counts.delete(key);
          if (counts.size <= 10) break;
        }
      }
    },
    reset: () => counts.clear(),
    snapshot: () => [...counts],
    restore: (entries) => {
      for (const [key, n] of entries) counts.set(key, n);
    },
  };
}

export function createMemoryAiCache(ttlMs: number, maxEntries = 500): AiCache & { reset(): void } {
  const map = new Map<string, { at: number; value: CachedAnswer }>();
  return {
    get(key, now) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value, now) {
      map.set(key, { at: now, value });
      while (map.size > maxEntries) {
        const first = map.keys().next().value;
        if (first === undefined) break;
        map.delete(first);
      }
    },
    reset: () => map.clear(),
  };
}

/** The UTC calendar day, used to reset budgets. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The next 00:00 UTC after `ms`. */
export function nextUtcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/**
 * What a provider error means for pacing: its daily allowance is used up (Workers AI error 4006, a Gemini per-day
 * quota), it is rate limited for now (HTTP 429, Workers AI 3040 capacity), or anything else.
 */
export function providerErrorKind(e: unknown): "daily" | "rate" | "other" {
  const text = e instanceof Error ? e.message : String(e);
  if (/\b4006\b|daily free allocation|per ?day/i.test(text)) return "daily";
  if (/\b429\b|\b3040\b|rate.?limit|too many requests|resource.?exhausted|capacity/i.test(text))
    return "rate";
  return "other";
}

/**
 * A stable key for a task and prompt: SHA-256 of both, in hex. Answers are cached and shared between visitors and
 * the prompt text comes from the browser, so the key must not collide on purpose: with a short hash (this was FNV-1a,
 * 32 bit) a visitor could craft a prompt with the same key as a real message's and have their answer shown to
 * everyone who opens that message.
 */
export async function cacheKey(task: string, prompt: string): Promise<string> {
  const bytes = new TextEncoder().encode(task + "\u0000" + prompt);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return task + ":" + hex;
}

export interface AiServiceOptions {
  /** In fallback order. */
  providers: readonly AiProvider[];
  /** Calls allowed per provider per UTC day. A provider without an entry is not used. */
  dailyBudget: Partial<Record<AiProviderName, number>>;
  /** Calls allowed per provider in any 60 s. A provider without an entry has no per-minute limit. */
  perMinute?: Partial<Record<AiProviderName, number>>;
  /** The kill switch. */
  enabled: () => boolean;
  budgets?: AiBudgetStore;
  /** Provider pauses; pass a map to keep them across service rebuilds or to save them. */
  paused?: Map<AiProviderName, AiPause>;
  cache?: AiCache;
  now?: () => number;
  /** Give up on one provider after this long, then try the next. */
  timeoutMs?: number;
}

export function createAiService(opts: AiServiceOptions) {
  const now = opts.now ?? Date.now;
  const budgets = opts.budgets ?? createMemoryBudgetStore();
  const cache = opts.cache ?? createMemoryAiCache(6 * 60 * 60 * 1000);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  /** Start times of the calls in the last minute, per provider. */
  const recent = new Map<AiProviderName, number[]>();
  const paused = opts.paused ?? new Map<AiProviderName, AiPause>();

  async function generate(req: AiRequest): Promise<AiResult> {
    if (!opts.enabled()) throw new AiUnavailableError("disabled", "AI features are switched off.");
    const prompt = req.prompt.trim();
    if (!req.task || !prompt || prompt.length > MAX_PROMPT_CHARS) {
      throw new AiUnavailableError("invalid-request", "The request is empty or too long.");
    }
    const limit = req.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const t = now();
    const key = await cacheKey(req.task, prompt);
    const hit = cache.get(key, t);
    if (hit) {
      return { ...hit, cached: true, label: AI_LABEL };
    }

    const day = utcDay(t);
    let busy = 0;
    let failed = 0;
    for (const provider of opts.providers) {
      const name = provider.name;
      const budget = opts.dailyBudget[name] ?? 0;
      if (budgets.used(name, day) >= budget) continue;
      const pause = paused.get(name);
      if (pause && pause.until > t) {
        if (!pause.daily) busy += 1;
        continue;
      }
      const times = (recent.get(name) ?? []).filter((at) => t - at < 60_000);
      recent.set(name, times);
      const perMinute = opts.perMinute?.[name];
      if (perMinute !== undefined && times.length >= perMinute) {
        // Answer at once instead of waiting for a free slot.
        busy += 1;
        continue;
      }
      // Count the attempt before it is made: a failing provider must not be hammered either.
      times.push(t);
      budgets.add(name, day, 1);
      const ctrl = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Raced, not only signalled: the Workers AI binding takes no signal and a hung call would never fall back.
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error("AI provider timed out"));
        }, timeoutMs);
      });
      try {
        const raw = await Promise.race([provider.generate(prompt, ctrl.signal), timedOut]);
        const text = raw.trim().slice(0, limit);
        if (!text) {
          failed += 1;
          continue;
        }
        const generatedAt = now();
        cache.set(key, { text, provider: name, generatedAt }, generatedAt);
        return { text, provider: name, cached: false, label: AI_LABEL, generatedAt };
      } catch (e) {
        // Try the next provider. The error text is only classified, never kept: it could contain the prompt.
        const kind = providerErrorKind(e);
        if (kind === "daily") {
          const at = now();
          paused.set(name, {
            until: provider.dailyResetAt?.(at) ?? nextUtcMidnight(at),
            daily: true,
          });
        } else if (kind === "rate") {
          paused.set(name, { until: now() + 60_000, daily: false });
          busy += 1;
        } else {
          failed += 1;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    if (busy > 0) throw new AiUnavailableError("busy", AI_BUSY_MESSAGE);
    if (failed > 0) throw new AiUnavailableError("all-failed", "The AI providers did not answer.");
    throw new AiUnavailableError(
      "budget",
      "The daily AI limit has been reached. Try again tomorrow.",
    );
  }

  return { generate };
}

// ---------- provider adapters ----------

export interface GeminiOptions {
  apiKey: string;
  /** Model name; check the current free-tier models before relying on the default. */
  model?: string;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Gemini through the Google AI Studio REST API. The key is sent in a header, never in the URL. */
export function createGeminiProvider(opts: GeminiOptions): AiProvider {
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  const f = opts.fetchImpl ?? fetch;
  return {
    name: "gemini",
    async generate(prompt, signal) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
      const init: RequestInit = {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      };
      if (signal) init.signal = signal;
      const res = await f(url, init);
      if (res.status === 429) {
        // The quota id in the error body says whether the per-minute or the per-day limit was hit.
        const body = await res.text().catch(() => "");
        throw new Error("Gemini HTTP 429" + (/PerDay/i.test(body) ? " per day" : ""));
      }
      if (!res.ok) throw new Error("Gemini HTTP " + res.status);
      return extractGeminiText(await res.json());
    },
    // Gemini's daily quota resets at midnight Pacific time, not UTC: check again every hour.
    dailyResetAt: (now) => now + 60 * 60 * 1000,
  };
}

/** The text of the first candidate, or an empty string. */
export function extractGeminiText(json: unknown): string {
  const root = json as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] } | null;
  const parts = root?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
}

/** The part of a Cloudflare Workers AI binding that this adapter uses. */
export interface WorkersAiBinding {
  run(
    model: string,
    input: { messages: { role: "user"; content: string }[]; max_tokens?: number },
  ): Promise<unknown>;
}

// Answers directly (no hidden reasoning that uses up the token budget) and in about 2 s; checked 2026-11-22.
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** Cloudflare Workers AI through a Worker binding. It only exists once the app runs on Cloudflare (Phase 16b). */
export function createWorkersAiProvider(
  binding: WorkersAiBinding,
  model = DEFAULT_WORKERS_AI_MODEL,
): AiProvider {
  return {
    name: "workers-ai",
    async generate(prompt) {
      // Chat format: a bare prompt skips the model's chat template and returns raw completions.
      // Model defaults are as low as 256 tokens; a batch of short descriptions needs more.
      const out = await binding.run(model, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
      });
      return extractWorkersAiText(out);
    },
  };
}

/** Answer text from Workers AI: `response` (a string, or already-parsed JSON) or the chat `choices` shape. */
export function extractWorkersAiText(out: unknown): string {
  const o = out as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
  } | null;
  if (typeof o?.response === "string") return o.response;
  if (o?.response != null && typeof o.response === "object") return JSON.stringify(o.response);
  const content = o?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}
