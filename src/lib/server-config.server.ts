/*
 * Server-side configuration and secrets (Phase 18b).
 *
 * Rules:
 * - Secrets live only in server environment variables (Cloudflare secrets in production, an
 *   uncommitted `.env` file in development). Never in the repository, the browser bundle or logs.
 * - Browser-visible values use the VITE_ prefix. A secret must NEVER start with VITE_.
 * - Messages here name variables, never print their values.
 * - A feature asks for its own group with requireConfig(); the app still starts without a group.
 * The `.server.ts` suffix keeps this file out of browser code (TanStack Start import protection).
 */

export const CONFIG_GROUPS = {
  /** Sign-in and database (Phase 18). The anon key is public by design; row-level security guards data. */
  supabase: {
    required: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
    optional: ["SUPABASE_SERVICE_ROLE_KEY"],
  },
  /** AI provider, Gemini first (Phase 18g). */
  gemini: {
    required: ["GEMINI_API_KEY"],
    optional: [],
  },
} as const;

export type ConfigGroup = keyof typeof CONFIG_GROUPS;
type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  readonly group: ConfigGroup | "public-env";
  readonly names: string[];
  constructor(group: ConfigGroup | "public-env", names: string[], message: string) {
    super(message);
    this.name = "ConfigError";
    this.group = group;
    this.names = names;
  }
}

const present = (env: Env, name: string) => (env[name] ?? "").trim().length > 0;

/** Names of VITE_ variables that look like secrets. Those would be baked into the browser bundle. */
export function findLeakedSecretNames(env: Env): string[] {
  return Object.keys(env).filter(
    (name) =>
      name.startsWith("VITE_") &&
      /(SECRET|SERVICE_ROLE|PRIVATE|TOKEN|PASSWORD|GEMINI|API_KEY)/i.test(name),
  );
}

/** Which groups are complete. Contains names only, never values. */
export function configStatus(
  env: Env = process.env,
): Record<ConfigGroup, { ok: boolean; missing: string[] }> {
  const out = {} as Record<ConfigGroup, { ok: boolean; missing: string[] }>;
  for (const group of Object.keys(CONFIG_GROUPS) as ConfigGroup[]) {
    const missing = CONFIG_GROUPS[group].required.filter((n) => !present(env, n));
    out[group] = { ok: missing.length === 0, missing: [...missing] };
  }
  return out;
}

function checkUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError("supabase", [name], `${name} is not a valid URL.`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new ConfigError("supabase", [name], `${name} must use https (localhost is allowed).`);
  }
}

/**
 * The trimmed values of a group, or a ConfigError that names what is missing.
 * Also refuses to run if a secret-looking VITE_ variable exists.
 */
export function requireConfig<G extends ConfigGroup>(
  group: G,
  env: Env = process.env,
): Record<(typeof CONFIG_GROUPS)[G]["required"][number], string> {
  const leaked = findLeakedSecretNames(env);
  if (leaked.length) {
    throw new ConfigError(
      "public-env",
      leaked,
      `These variables start with VITE_ and look like secrets, so they would be sent to every browser: ${leaked.join(", ")}. Rename them without the VITE_ prefix.`,
    );
  }
  const missing = CONFIG_GROUPS[group].required.filter((n) => !present(env, n));
  if (missing.length) {
    throw new ConfigError(
      group,
      [...missing],
      `Missing configuration for ${group}: ${missing.join(", ")}. See .env.example.`,
    );
  }
  const values: Record<string, string> = {};
  for (const name of CONFIG_GROUPS[group].required) values[name] = (env[name] ?? "").trim();
  if (group === "supabase") checkUrl("SUPABASE_URL", values["SUPABASE_URL"] ?? "");
  return values as Record<(typeof CONFIG_GROUPS)[G]["required"][number], string>;
}
