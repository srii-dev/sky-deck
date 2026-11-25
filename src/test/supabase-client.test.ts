import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthConfig, createClient } = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/lib/auth-config.functions", () => ({ getAuthConfig }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const configured = { configured: true, url: "https://x.supabase.co", anonKey: "anon" };

/** A fresh copy of the module: it keeps the client it made. */
async function load() {
  vi.resetModules();
  return import("@/lib/supabase-client");
}

beforeEach(() => {
  getAuthConfig.mockReset().mockResolvedValue(configured);
  createClient.mockReset().mockImplementation(() => ({ made: true }));
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hasStoredSession", () => {
  it("is true only when a Supabase auth token is saved", async () => {
    const { hasStoredSession } = await load();
    localStorage.setItem("skydeck-theme", "dark");
    localStorage.setItem("sb-abc-code-verifier", "x");
    localStorage.setItem("other-auth-token", "x");
    expect(hasStoredSession()).toBe(false);
    localStorage.setItem("sb-abc-auth-token", "{}");
    expect(hasStoredSession()).toBe(true);
  });

  it("is false when storage is blocked", async () => {
    const { hasStoredSession } = await load();
    vi.stubGlobal("localStorage", {
      get length(): number {
        throw new Error("blocked");
      },
    });
    expect(hasStoredSession()).toBe(false);
  });
});

describe("getSupabase", () => {
  it("creates one client with the public key and keeps it", async () => {
    const { getSupabase } = await load();
    const [a, b] = await Promise.all([getSupabase(), getSupabase()]);
    expect(a).toBe(b);
    expect(await getSupabase()).toBe(a);
    expect(getAuthConfig).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.co", "anon", {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  });

  it("is null, without loading a client, when the site has no Supabase", async () => {
    getAuthConfig.mockResolvedValue({ configured: false, url: null, anonKey: null });
    const { getSupabase } = await load();
    expect(await getSupabase()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("asks again after a failed lookup", async () => {
    getAuthConfig.mockRejectedValueOnce(new Error("offline"));
    const { getSupabase } = await load();
    expect(await getSupabase()).toBeNull();
    expect(await getSupabase()).toEqual({ made: true });
    expect(getAuthConfig).toHaveBeenCalledTimes(2);
  });

  it("does nothing on a server render", async () => {
    const { getSupabase } = await load();
    vi.stubGlobal("window", undefined);
    expect(await getSupabase()).toBeNull();
    expect(getAuthConfig).not.toHaveBeenCalled();
  });
});
