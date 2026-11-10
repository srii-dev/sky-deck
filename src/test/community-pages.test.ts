import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseChangelog, plainText } from "@/lib/changelog-parse";
import { LEGAL_PAGES, legalPage } from "@/lib/legal-content";
import { SITEMAP_PATHS } from "@/lib/site-meta";
import { BUG_URL, FEEDBACK_URL, HELP_PAGE, PRESS_PAGE, SITE_PAGES } from "@/lib/site-pages";
import {
  buildProbes,
  runAllProbes,
  runProbe,
  summarize,
  type FetchLike,
  type Probe,
} from "@/lib/status-probes";

const root = process.cwd();

describe("help and press pages", () => {
  it("have real text, unique headings and the feedback link", () => {
    for (const p of SITE_PAGES) {
      expect(p.sections.length).toBeGreaterThanOrEqual(4);
      const headings = p.sections.map((s) => s.heading);
      expect(new Set(headings).size).toBe(headings.length);
      for (const s of p.sections)
        for (const para of s.paragraphs) expect(para.length).toBeGreaterThan(20);
      expect(p.sections.flatMap((s) => s.paragraphs).join("\n")).toContain(FEEDBACK_URL);
    }
    expect(SITE_PAGES.map((p) => p.path)).toEqual(["/help", "/press"]);
  });

  it("answer the questions people really hit, and warn about the limits", () => {
    const t = HELP_PAGE.sections.flatMap((s) => [s.heading, ...s.paragraphs]).join("\n");
    for (const w of [
      "Live data is busy",
      "7700",
      "Delete my saved data",
      "navigation, flight planning",
    ]) {
      expect(t).toContain(w);
    }
  });

  it("gives the press kit credit lines for every source the app credits", () => {
    const t = PRESS_PAGE.sections.flatMap((s) => s.paragraphs).join("\n");
    for (const name of ["adsb.lol", "OpenFreeMap", "Chakra Petch"]) expect(t).toContain(name);
    expect(t).toContain("#f5b83d");
  });

  it("are all in the sitemap, and the icons the press kit names exist", () => {
    for (const path of ["/help", "/press", "/whats-new", "/status"])
      expect(SITEMAP_PATHS).toContain(path);
    for (const f of ["public/icons/icon-512.png", "public/icons/icon-192.png"]) {
      expect(existsSync(resolve(root, f))).toBe(true);
    }
  });
});

describe("feedback", () => {
  it("links to the project's issues and has templates for them", () => {
    expect(FEEDBACK_URL).toMatch(/^https:\/\/github\.com\/.+\/issues\/new\/choose$/);
    expect(BUG_URL).toContain("template=bug_report.md");
    for (const f of ["bug_report.md", "feedback.md", "config.yml"]) {
      expect(existsSync(resolve(root, ".github/ISSUE_TEMPLATE", f))).toBe(true);
    }
    const bug = readFileSync(resolve(root, ".github/ISSUE_TEMPLATE/bug_report.md"), "utf8");
    expect(bug).toMatch(/do not include passwords/i);
  });

  it("has a written terms section for what visitors send and for takedowns", () => {
    const terms = legalPage("/terms")!;
    const headings = terms.sections.map((s) => s.heading);
    expect(headings).toContain("Feedback you send");
    expect(headings).toContain("Complaints and takedown process");
    const t = terms.sections.flatMap((s) => s.paragraphs).join("\n");
    expect(t).toMatch(/what it is, where you saw it/);
    expect(t).toMatch(/not legal advice/);
    expect(LEGAL_PAGES.length).toBe(4);
  });
});

describe("parseChangelog", () => {
  it("reads releases, groups and items, and strips markdown marks", () => {
    const r = parseChangelog(
      [
        "# Changelog",
        "",
        "## Unreleased",
        "",
        "### Added",
        "",
        "- A **bold** thing with `code` and a [link](https://x.test).",
        "- Second",
        "  continued here.",
        "",
        "### Fixed",
        "",
        "- One fix",
        "",
        "## 1.0.0 - 2026-12-01",
        "",
        "### Added",
        "",
        "- First release",
        "",
        "### Empty",
        "",
      ].join("\n"),
    );
    expect(r.map((x) => x.heading)).toEqual(["Unreleased", "1.0.0 - 2026-12-01"]);
    expect(r[0]!.groups.map((g) => g.name)).toEqual(["Added", "Fixed"]);
    expect(r[0]!.groups[0]!.items).toEqual([
      "A bold thing with code and a link.",
      "Second continued here.",
    ]);
    // A group with no items is dropped.
    expect(r[1]!.groups.map((g) => g.name)).toEqual(["Added"]);
    expect(plainText("  a   *b*  ")).toBe("a b");
  });

  it("reads the real changelog: an Unreleased section with items in Added", () => {
    const md = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
    const r = parseChangelog(md);
    expect(r[0]!.heading).toBe("Unreleased");
    const added = r[0]!.groups.find((g) => g.name === "Added")!;
    expect(added.items.length).toBeGreaterThan(10);
    for (const item of added.items) {
      expect(item).not.toMatch(/[`*]|\]\(/);
      expect(item.length).toBeGreaterThan(10);
    }
  });
});

describe("status probes", () => {
  const ok: FetchLike = async () => ({ status: 200, ok: true });
  const probe = (over: Partial<Probe> = {}): Probe => ({
    id: "p",
    name: "P",
    usedFor: "x",
    request: { url: "https://p.test/" },
    ...over,
  });

  it("calls an answering service working and records how long it took", async () => {
    let t = 1000;
    const r = await runProbe(
      probe(),
      async () => ((t += 120), { status: 200, ok: true }),
      () => t,
    );
    expect(r).toMatchObject({ state: "ok", note: "Answering" });
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it("calls a slow answer slow, a refusal blocked, an error down, and a timeout down", async () => {
    let t = 0;
    const clock = () => t;
    expect(
      (await runProbe(probe(), async () => ((t += 4000), { status: 200, ok: true }), clock)).state,
    ).toBe("slow");
    for (const status of [401, 403, 429]) {
      expect((await runProbe(probe(), async () => ({ status, ok: false }))).state).toBe("blocked");
    }
    expect((await runProbe(probe(), async () => ({ status: 503, ok: false }))).state).toBe("down");
    const never: FetchLike = (_u, init) =>
      new Promise((_res, rej) =>
        init.signal.addEventListener("abort", () => rej(new Error("abort"))),
      );
    const timedOut = await runProbe(probe(), never, Date.now, 20);
    expect(timedOut).toMatchObject({ state: "down", ms: null });
    const boom = await runProbe(probe(), async () => {
      throw new Error("network");
    });
    expect(boom.state).toBe("down");
  });

  it("skips services that are not set up or not used, without asking", async () => {
    let calls = 0;
    const f: FetchLike = async () => (calls++, { status: 200, ok: true });
    const r = await runProbe(
      probe({ request: null, skipped: { state: "unused", note: "No feature uses it." } }),
      f,
    );
    expect(r).toMatchObject({ state: "unused", ms: null, note: "No feature uses it." });
    expect(calls).toBe(0);
  });

  it("asks the accounts service only when it is configured, and never returns the key", async () => {
    const without = buildProbes({});
    expect(without.find((p) => p.id === "accounts")!.request).toBeNull();
    const withKeys = buildProbes({
      SUPABASE_URL: "https://x.supabase.co/",
      SUPABASE_ANON_KEY: "anon-key",
    });
    expect(withKeys.find((p) => p.id === "accounts")!.request!.url).toBe(
      "https://x.supabase.co/auth/v1/health",
    );
    const report = await runAllProbes(
      { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon-key" },
      ok,
    );
    expect(JSON.stringify(report)).not.toContain("anon-key");
  });

  it("summarises the overall state from the services that are in use", () => {
    const base = { id: "a", name: "A", usedFor: "", ms: 1, note: "" };
    expect(
      summarize(
        [
          { ...base, state: "ok" },
          { ...base, state: "unused" },
        ],
        1,
      ).overall,
    ).toBe("ok");
    expect(
      summarize(
        [
          { ...base, state: "ok" },
          { ...base, state: "down" },
        ],
        1,
      ).overall,
    ).toBe("degraded");
    expect(
      summarize(
        [
          { ...base, state: "down" },
          { ...base, state: "blocked" },
        ],
        1,
      ).overall,
    ).toBe("down");
    expect(summarize([{ ...base, state: "not-configured" }], 1).overall).toBe("ok");
    expect(summarize([{ ...base, state: "slow" }], 5).checkedAt).toBe(5);
  });

  it("checks every service the app relies on", () => {
    const ids = buildProbes({}).map((p) => p.id);
    for (const id of [
      "adsb-lol",
      "airplanes-live",
      "weather",
      "faa-status",
      "faa-airspace",
      "accounts",
      "ai",
    ]) {
      expect(ids).toContain(id);
    }
  });
});
