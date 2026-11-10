import { describe, expect, it } from "vitest";

import { CONTACT_URL, LEGAL_PAGES, legalPage } from "@/lib/legal-content";
import { SITEMAP_PATHS } from "@/lib/site-meta";
import { CREDITS } from "@/lib/credits";

const text = (path: string) =>
  legalPage(path)!
    .sections.flatMap((s) => [s.heading, ...s.paragraphs])
    .join("\n");

describe("legal pages", () => {
  it("has four pages with unique paths, real text and a date", () => {
    expect(LEGAL_PAGES.map((p) => p.path)).toEqual(["/about", "/privacy", "/terms", "/disclaimer"]);
    for (const p of LEGAL_PAGES) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.description.length).toBeGreaterThan(20);
      expect(p.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sections.length).toBeGreaterThanOrEqual(2);
      for (const s of p.sections) {
        expect(s.heading).not.toBe("");
        for (const para of s.paragraphs) expect(para.length).toBeGreaterThan(30);
      }
      const headings = p.sections.map((s) => s.heading);
      expect(new Set(headings).size).toBe(headings.length);
    }
  });

  it("is in the sitemap", () => {
    for (const p of LEGAL_PAGES) expect(SITEMAP_PATHS).toContain(p.path);
  });

  it("gives a way to make a takedown request and points to the public issues page", () => {
    expect(CONTACT_URL).toMatch(/^https:\/\/github\.com\/.+\/issues$/);
    expect(text("/terms")).toMatch(/takedown/i);
    expect(text("/terms")).toMatch(/GitHub/);
    expect(text("/privacy")).toMatch(/Contact/);
  });

  it("keeps the privacy page in step with what the app does", () => {
    const t = text("/privacy");
    for (const word of [
      "local storage",
      "Supabase",
      "Delete my saved data",
      "Delete my account",
      "OpenFreeMap",
      "RainViewer",
      "Airframes",
      "30 minutes",
    ]) {
      expect(t).toContain(word);
    }
    // The fonts are self-hosted now, so the page must not say Google serves them.
    expect(t).toMatch(/fonts are served by this site/);
  });

  it("says plainly that the app is not for safety use", () => {
    expect(text("/disclaimer")).toMatch(/navigation, flight planning/);
    expect(text("/disclaimer")).toMatch(/estimates/);
  });

  it("credits the fonts as served by the site itself", () => {
    const f = CREDITS.find((c) => c.id === "fonts")!;
    expect(f.usedFor).toMatch(/served from this site/);
    expect(f.licence).toMatch(/Open Font License/);
  });
});
