import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const all = files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");

describe("database migrations", () => {
  it("has at least one migration, named with a timestamp", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it("switches row-level security on for every table it creates", () => {
    const created = [
      ...all.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(public\.[a-z_]+)/gi),
    ].map((m) => m[1]!.toLowerCase());
    expect(created.length).toBeGreaterThan(0);
    for (const table of created) {
      const re = new RegExp(
        `alter\\s+table\\s+${table.replace(".", "\\.")}\\s+enable\\s+row\\s+level\\s+security`,
        "i",
      );
      expect(all, `${table} must enable row level security`).toMatch(re);
    }
  });

  it("contains no secrets or connection strings", () => {
    expect(all).not.toMatch(/postgres(ql)?:\/\//i);
    expect(all).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/); // JWT-looking values
  });
});

describe("security definer functions", () => {
  it("revokes public execute for every security definer function it creates", () => {
    const fns = [
      ...all.matchAll(
        /create\s+(?:or\s+replace\s+)?function\s+(public\.[a-z_]+)[^;]*?security\s+definer/gis,
      ),
    ].map((m) => m[1]!.toLowerCase());
    // Compare on one line of single-spaced lowercase text, so line breaks and indentation do not matter.
    const flat = all.toLowerCase().split(/\s+/).join(" ");
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) {
      const wanted = "revoke execute on function " + fn + "()";
      expect(flat, `${fn} must revoke execute from public, anon and authenticated`).toContain(
        wanted,
      );
    }
  });
});
