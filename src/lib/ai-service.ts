/*
 * AI service wrapper (Phase 18g). One interface over several providers, used by later features (airport brief
 * in 14c, flight summaries, and so on). Nothing calls it yet.
 *
 * Rules built in:
 *  - Fallback order: providers are tried in the order given (Gemini first, then Cloudflare Workers AI).
 *  - A daily budget per provider: a provider that used its budget is skipped until the next UTC day.
 *  - A kill switch: when `enabled()` is false nothing is generated and nothing is spent.
 *  - A cache: the same task and prompt is answered from the cache without asking a provider or spending budget.
 *  - Every answer says which provider wrote it and carries the label "AI-generated" for display.
 *  - On demand only: there is no background generation here.
 * The caller decides what may be sent. No ACARS message text goes to Gemini until its free-tier data-use terms
 * have been checked (decision 2026-11-07).
 * Budgets and cache are kept in memory of one server instance behind small interfaces, so a shared store
 * (Supabase table or Cloudflare KV, Phase 18f) can replace them without changing callers.
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

export type AiFailureReason = "disabled" | "invalid-request" | "budget" | "all-failed";

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

export function createMemoryBudgetStore(): AiBudgetStore & { reset(): void } {
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

/** A short stable key for a task and prompt (FNV-1a, 32 bit, plus the length). Not a security measure. */
export function cacheKey(task: string, prompt: string): string {
  let h = 0x811c9dc5;
  const text = task + "\u0000" + prompt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return task + ":" + h.toString(16) + ":" + text.length;
}

export interface AiServiceOptions {
  /** In fallback order. */
  providers: readonly AiProvider[];
  /** Calls allowed per provider per UTC day. A provider without an entry is not used. */
  dailyBudget: Partial<Record<AiProviderName, number>>;
  /** The kill switch. */
  enabled: () => boolean;
  budgets?: AiBudgetStore;
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

  async function generate(req: AiRequest): Promise<AiResult> {
    if (!opts.enabled()) throw new AiUnavailableError("disabled", "AI features are switched off.");
    const prompt = req.prompt.trim();
    if (!req.task || !prompt || prompt.length > MAX_PROMPT_CHARS) {
      throw new AiUnavailableError("invalid-request", "The request is empty or too long.");
    }
    const limit = req.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const t = now();
    const key = cacheKey(req.task, prompt);
    const hit = cache.get(key, t);
    if (hit) {
      return { ...hit, cached: true, label: AI_LABEL };
    }

    const day = utcDay(t);
    let skippedForBudget = 0;
    let tried = 0;
    for (const provider of opts.providers) {
      const budget = opts.dailyBudget[provider.name] ?? 0;
      if (budgets.used(provider.name, day) >= budget) {
        skippedForBudget += 1;
        continue;
      }
      tried += 1;
      // Count the attempt before it is made: a failing provider must not be hammered either.
      budgets.add(provider.name, day, 1);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const raw = await provider.generate(prompt, ctrl.signal);
        const text = raw.trim().slice(0, limit);
        if (!text) continue;
        const generatedAt = now();
        cache.set(key, { text, provider: provider.name, generatedAt }, generatedAt);
        return { text, provider: provider.name, cached: false, label: AI_LABEL, generatedAt };
      } catch {
        // Try the next provider. The error text is not kept: it could contain the prompt or a key.
      } finally {
        clearTimeout(timer);
      }
    }
    if (tried === 0 && skippedForBudget > 0) {
      throw new AiUnavailableError(
        "budget",
        "The daily AI limit has been reached. Try again tomorrow.",
      );
    }
    throw new AiUnavailableError("all-failed", "The AI providers did not answer.");
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

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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
      if (!res.ok) throw new Error("Gemini HTTP " + res.status);
      return extractGeminiText(await res.json());
    },
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
  run(model: string, input: { prompt: string }): Promise<unknown>;
}

export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/** Cloudflare Workers AI through a Worker binding. It only exists once the app runs on Cloudflare (Phase 16b). */
export function createWorkersAiProvider(
  binding: WorkersAiBinding,
  model = DEFAULT_WORKERS_AI_MODEL,
): AiProvider {
  return {
    name: "workers-ai",
    async generate(prompt) {
      const out = (await binding.run(model, { prompt })) as { response?: unknown } | null;
      return typeof out?.response === "string" ? out.response : "";
    },
  };
}
