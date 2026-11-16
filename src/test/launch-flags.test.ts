import { afterEach, describe, expect, it, vi } from "vitest";

import { allowedBasemap } from "@/components/skydeck/map-config";
import { browserFlags, FLAGS_STORAGE_KEY, resolveFlags, serverFlags } from "@/lib/flags";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  localStorage.clear();
});

describe("acars and satellite flags", () => {
  it("are on by default, so a normal build is unchanged", () => {
    expect(resolveFlags()).toMatchObject({ acars: true, satellite: true, labs: false });
    expect(serverFlags()).toMatchObject({ acars: true, satellite: true });
  });

  it("are switched off by the build list", () => {
    vi.stubEnv("VITE_FLAGS", "-acars -satellite");
    expect(serverFlags()).toMatchObject({ acars: false, satellite: false });
    vi.stubEnv("VITE_FLAGS", "-satellite");
    expect(serverFlags()).toMatchObject({ acars: true, satellite: false });
  });

  it("cannot be switched back on by a tester's stored list when the build switched them off", () => {
    vi.stubEnv("VITE_FLAGS", "-acars,-satellite");
    localStorage.setItem(FLAGS_STORAGE_KEY, "acars satellite labs");
    const f = browserFlags();
    expect(f.acars).toBe(false);
    expect(f.satellite).toBe(false);
    expect(f.labs).toBe(true); // other flags still follow the tester's list
  });

  it("can still be switched off by a tester when the build leaves them on", () => {
    localStorage.setItem(FLAGS_STORAGE_KEY, "-satellite");
    expect(browserFlags().satellite).toBe(false);
    expect(browserFlags().acars).toBe(true);
  });
});

describe("allowedBasemap", () => {
  it("falls back to Dark for Satellite only when Satellite is off", () => {
    expect(allowedBasemap("satellite", false)).toBe("dark");
    expect(allowedBasemap("satellite", true)).toBe("satellite");
    expect(allowedBasemap("light", false)).toBe("light");
    expect(allowedBasemap("dark", false)).toBe("dark");
  });
});

describe("text that follows the flags", () => {
  const load = async () => {
    vi.resetModules();
    const credits = await import("@/lib/credits");
    const pages = await import("@/lib/site-pages");
    const legal = await import("@/lib/legal-content");
    return {
      ids: credits.CREDITS.map((c) => c.id),
      help: JSON.stringify(pages.HELP_PAGE),
      privacy: JSON.stringify(legal),
    };
  };

  it("keeps everything in a normal build", async () => {
    const t = await load();
    expect(t.ids).toContain("esri");
    expect(t.ids).toContain("airframes");
    expect(t.help).toContain("ACARS messages");
    expect(t.help).toContain("Esri");
    expect(t.privacy).toContain("Esri");
    expect(t.privacy).toContain("ACARS messages from Airframes");
  });

  it("leaves out the credit and every sentence about a feature that is switched off", async () => {
    vi.stubEnv("VITE_FLAGS", "-acars -satellite");
    const t = await load();
    expect(t.ids).not.toContain("esri");
    expect(t.ids).not.toContain("airframes");
    for (const text of [t.help, t.privacy]) {
      expect(text).not.toMatch(/Esri|ACARS|Airframes|imagery/);
    }
  });
});
