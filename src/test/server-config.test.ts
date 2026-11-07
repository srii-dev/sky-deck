import { describe, expect, it } from "vitest";
import {
  ConfigError,
  configStatus,
  findLeakedSecretNames,
  requireConfig,
} from "@/lib/server-config.server";

const good = {
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "anon-value",
  GEMINI_API_KEY: "gem-value",
};

describe("server configuration", () => {
  it("reports which groups are complete, by name only", () => {
    const s = configStatus({ SUPABASE_URL: "https://x.supabase.co" });
    expect(s.supabase).toEqual({ ok: false, missing: ["SUPABASE_ANON_KEY"] });
    expect(s.gemini).toEqual({ ok: false, missing: ["GEMINI_API_KEY"] });
    expect(configStatus(good).supabase.ok).toBe(true);
  });

  it("returns trimmed values for a complete group", () => {
    const v = requireConfig("supabase", { ...good, SUPABASE_ANON_KEY: "  anon-value  " });
    expect(v.SUPABASE_URL).toBe("https://abc.supabase.co");
    expect(v.SUPABASE_ANON_KEY).toBe("anon-value");
  });

  it("names missing variables and never prints values", () => {
    try {
      requireConfig("supabase", { SUPABASE_URL: "https://secret-host.example" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.names).toEqual(["SUPABASE_ANON_KEY"]);
      expect(err.message).toContain("SUPABASE_ANON_KEY");
      expect(err.message).not.toContain("secret-host");
    }
  });

  it("treats empty or blank values as missing", () => {
    expect(() => requireConfig("gemini", { GEMINI_API_KEY: "   " })).toThrow(ConfigError);
  });

  it("rejects a Supabase URL that is not https (localhost is allowed)", () => {
    expect(() =>
      requireConfig("supabase", { ...good, SUPABASE_URL: "http://abc.supabase.co" }),
    ).toThrow(/https/);
    expect(() => requireConfig("supabase", { ...good, SUPABASE_URL: "not a url" })).toThrow(
      /valid URL/,
    );
    expect(() =>
      requireConfig("supabase", { ...good, SUPABASE_URL: "http://localhost:54321" }),
    ).not.toThrow();
  });

  it("finds secret-looking VITE_ variables and refuses to run with them", () => {
    const env = {
      ...good,
      VITE_GEMINI_API_KEY: "oops",
      VITE_FLAGS: "labs",
      VITE_SUPABASE_ANON_KEY: "",
    };
    expect(findLeakedSecretNames(env)).toEqual(["VITE_GEMINI_API_KEY"]);
    expect(() => requireConfig("gemini", env)).toThrow(/VITE_/);
  });

  it("does not flag ordinary public variables", () => {
    expect(findLeakedSecretNames({ VITE_FLAGS: "labs", VITE_SUPABASE_URL: "https://x" })).toEqual(
      [],
    );
  });
});
