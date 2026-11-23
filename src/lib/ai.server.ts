import { describeBriefs, type AcarsAiInput } from "./acars-ai";
import {
  AiUnavailableError,
  createAiService,
  createGeminiProvider,
  createMemoryAiCache,
  createMemoryBudgetStore,
  createWorkersAiProvider,
  type AiFailureReason,
  type AiPause,
  type AiProvider,
  type AiProviderName,
  type AiRequest,
  type AiResult,
  type WorkersAiBinding,
} from "./ai-service";

/*
 * The app's one AI service: Cloudflare Workers AI first (the `AI` binding, only present on Cloudflare), Gemini as
 * the fallback when GEMINI_API_KEY is set. Kill switch: AI_ENABLED=off. Server-only (.server.ts).
 * On Cloudflare the work runs in the global AiHub Durable Object (src/server/ai-hub.ts, binding AI_HUB), so the
 * budgets, per-minute pacing and caches are shared by every visitor and Worker instance. Without the binding
 * (dev server, tests, the CI worker build) or when the object cannot be reached, it runs in this instance.
 */

// Workers AI free plan: 10,000 neurons a day (reset 00:00 UTC). llama-4-scout costs 24,545 neurons per million
// input tokens and 77,273 per million output tokens (checked 2026-11-23): a headline batch is roughly 50-90
// neurons, an explanation 20-40 (estimates). The 4006 "daily allocation used" error also pauses it until 00:00 UTC.
// Gemini free-tier limits for the model could not be confirmed on Google's rate-limit page (it points to the AI
// Studio console): these are deliberately low guesses.
const DAILY_BUDGET = { "workers-ai": 250, gemini: 200 } as const;
const PER_MINUTE = { "workers-ai": 12, gemini: 6 } as const;

type Service = ReturnType<typeof createAiService>;
type ReadVar = (name: string) => string | undefined;

let service: Service | null = null;
let builtWith = "";

/** Headlines per message (Airframes id plus text hash). Memory only, never written to storage. */
const briefCache = createMemoryAiCache(3 * 60 * 60 * 1000, 3000);

// Daily counts and provider pauses outlive service rebuilds; the AiHub saves them (no text) to its storage.
const budgets = createMemoryBudgetStore();
const paused = new Map<AiProviderName, AiPause>();

/** The pacing counters only: call counts per provider and day, and provider pauses. Never prompts or answers. */
export interface AiPacingState {
  counts: [string, number][];
  paused: [AiProviderName, AiPause][];
}

export function pacingSnapshot(): AiPacingState {
  return { counts: budgets.snapshot(), paused: [...paused] };
}

export function restorePacing(state: AiPacingState) {
  budgets.restore(state.counts ?? []);
  for (const [name, p] of state.paused ?? []) paused.set(name, p);
}

export function asWorkersAiBinding(v: unknown): WorkersAiBinding | null {
  const b = v as WorkersAiBinding | null | undefined;
  return b && typeof b.run === "function" ? b : null;
}

function workersAiBinding(): WorkersAiBinding | null {
  // Nitro's Cloudflare entry puts the Worker env (bindings included) here on every request. It is not set inside
  // a Durable Object, which passes its own env instead.
  return asWorkersAiBinding((globalThis as { __env__?: { AI?: unknown } }).__env__?.AI);
}

/** The service for these providers, or null when none is configured. Rebuilt if the configuration changes. */
export function buildAiService(binding: WorkersAiBinding | null, read: ReadVar): Service | null {
  const geminiKey = (read("GEMINI_API_KEY") ?? "").trim();
  const enabled = (read("AI_ENABLED") ?? "").trim().toLowerCase() !== "off";
  const providersShape = (binding ? "w" : "") + (geminiKey ? "g" : "");
  if (!providersShape) return null;
  const shape = providersShape + (enabled ? "" : "-off");
  if (service && builtWith === shape) return service;
  const providers: AiProvider[] = [];
  if (binding) providers.push(createWorkersAiProvider(binding));
  if (geminiKey) providers.push(createGeminiProvider({ apiKey: geminiKey }));
  service = createAiService({
    providers,
    dailyBudget: DAILY_BUDGET,
    perMinute: PER_MINUTE,
    budgets,
    paused,
    enabled: () => enabled,
  });
  builtWith = shape;
  return service;
}

/** The AI work callers ask for, done by `s` in this instance. */
export function aiWork(s: Service) {
  return {
    generate: (req: AiRequest): Promise<AiResult> => s.generate(req),
    acarsBriefs: (messages: AcarsAiInput[]) => describeBriefs(s, briefCache, messages),
  };
}
export type AiWork = ReturnType<typeof aiWork>;

/**
 * What the AiHub sends back. Errors thrown across Durable Object RPC lose their class, so a failure travels as
 * data and is rethrown as AiUnavailableError on the Worker side.
 */
export type HubResult<T> =
  { ok: true; value: T } | { ok: false; reason: AiFailureReason; message: string };

export async function settle<T>(run: () => Promise<T>): Promise<HubResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    if (e instanceof AiUnavailableError) return { ok: false, reason: e.reason, message: e.message };
    return { ok: false, reason: "all-failed", message: "The AI providers did not answer." };
  }
}

/** The AiHub's RPC methods. null: the object has no provider configured, so the caller works locally. */
interface AiHubStub {
  generate(req: AiRequest): Promise<HubResult<AiResult> | null>;
  acarsBriefs(
    messages: AcarsAiInput[],
  ): Promise<HubResult<Awaited<ReturnType<AiWork["acarsBriefs"]>>> | null>;
}
interface AiHubNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): AiHubStub;
}

/** One object for the whole site, like FeedHub. */
const HUB_NAME = "global";

function aiHub(): AiHubStub | null {
  const ns = (globalThis as { __env__?: { AI_HUB?: AiHubNamespace } }).__env__?.AI_HUB;
  if (!ns || typeof ns.idFromName !== "function") return null;
  return ns.get(ns.idFromName(HUB_NAME));
}

async function viaHub<T>(
  call: (hub: AiHubStub) => Promise<HubResult<T> | null>,
  local: () => Promise<T>,
): Promise<T> {
  const hub = aiHub();
  if (hub) {
    let r: HubResult<T> | null = null;
    try {
      r = await call(hub);
    } catch {
      // The object could not be reached: do the work here; the next request tries the object again.
    }
    if (r?.ok) return r.value;
    if (r) throw new AiUnavailableError(r.reason, r.message);
  }
  return local();
}

/** The service, or null when no provider is configured here. Its calls go through the AiHub when it exists. */
export function getAiService(env: Record<string, string | undefined> = process.env): AiWork | null {
  const local = buildAiService(workersAiBinding(), (name) => env[name]);
  if (!local) return null;
  const work = aiWork(local);
  return {
    generate: (req) =>
      viaHub(
        (h) => h.generate(req),
        () => work.generate(req),
      ),
    acarsBriefs: (messages) =>
      viaHub(
        (h) => h.acarsBriefs(messages),
        () => work.acarsBriefs(messages),
      ),
  };
}
