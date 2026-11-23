import {
  createAiService,
  createGeminiProvider,
  createWorkersAiProvider,
  type AiProvider,
  type WorkersAiBinding,
} from "./ai-service";

/*
 * The app's one AI service: Cloudflare Workers AI first (the `AI` binding, only present on Cloudflare), Gemini as
 * the fallback when GEMINI_API_KEY is set. Kill switch: AI_ENABLED=off. Server-only (.server.ts).
 * Budgets and cache are per server instance (see ai-service.ts).
 */

const DAILY_BUDGET = { "workers-ai": 3000, gemini: 1000 } as const;

type Service = ReturnType<typeof createAiService>;
let service: Service | null = null;
let builtWith = "";

function workersAiBinding(): WorkersAiBinding | null {
  // Nitro's Cloudflare entry puts the Worker env (bindings included) here on every request.
  const env = (globalThis as { __env__?: { AI?: WorkersAiBinding } }).__env__;
  return env?.AI && typeof env.AI.run === "function" ? env.AI : null;
}

/** The service, or null when no provider is configured. Rebuilt if the available providers change. */
export function getAiService(
  env: Record<string, string | undefined> = process.env,
): Service | null {
  const binding = workersAiBinding();
  const geminiKey = (env["GEMINI_API_KEY"] ?? "").trim();
  const shape = (binding ? "w" : "") + (geminiKey ? "g" : "");
  if (!shape) return null;
  if (service && builtWith === shape) return service;
  const providers: AiProvider[] = [];
  if (binding) providers.push(createWorkersAiProvider(binding));
  if (geminiKey) providers.push(createGeminiProvider({ apiKey: geminiKey }));
  service = createAiService({
    providers,
    dailyBudget: DAILY_BUDGET,
    enabled: () => (process.env["AI_ENABLED"] ?? "").trim().toLowerCase() !== "off",
  });
  builtWith = shape;
  return service;
}
