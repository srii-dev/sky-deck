import { describe, expect, it } from "vitest";

import { buildCsp, CSP_CONNECT_ORIGINS, supabaseOrigin } from "@/lib/csp";
import { MAX_CSP_REPORT_BYTES, parseCspReports, readTextLimited } from "@/lib/csp-report";
import {
  indexingOff,
  SECURITY_HEADERS,
  securityOptionsFromEnv,
  withSecurityHeaders,
} from "@/lib/security-headers";
import { robotsTxt } from "@/lib/site-meta";

const html = () =>
  new Response("<p>x</p>", { headers: { "content-type": "text/html; charset=utf-8" } });

describe("buildCsp", () => {
  const csp = buildCsp();
  const directive = (name: string) =>
    csp
      .split("; ")
      .find((d) => d.startsWith(name + " "))
      ?.split(" ")
      .slice(1) ?? [];

  it("is well formed: every directive once, separated by semicolons, ending with the report address", () => {
    const names = csp.split("; ").map((d) => d.split(" ")[0]);
    expect(new Set(names).size).toBe(names.length);
    expect(csp.endsWith("report-uri /api/csp-report")).toBe(true);
  });

  it("allows every outside address the map uses, in connect-src only", () => {
    const connect = directive("connect-src");
    for (const origin of CSP_CONNECT_ORIGINS) expect(connect).toContain(origin);
    for (const host of [
      "tiles.openfreemap.org",
      "server.arcgisonline.com",
      "s3.amazonaws.com",
      "api.rainviewer.com",
      "tilecache.rainviewer.com",
      "mesonet.agron.iastate.edu",
      "api.airframes.io",
    ]) {
      expect(connect).toContain("https://" + host);
    }
    expect(directive("script-src").some((v) => v.startsWith("https:"))).toBe(false);
  });

  it("never uses a bare wildcard or allows plain http", () => {
    expect(csp).not.toMatch(/(^|[ ;])\*([ ;]|$)/);
    expect(csp).not.toContain("http:");
  });

  it("lets the map run its workers from a blob and blocks plugins and frames", () => {
    expect(directive("worker-src")).toEqual(["'self'", "blob:"]);
    expect(directive("object-src")).toEqual(["'none'"]);
    expect(directive("frame-src")).toEqual(["'none'"]);
  });

  it("does not set frame-ancestors, because embedding the map is a feature", () => {
    expect(csp).not.toContain("frame-ancestors");
  });

  it("adds the Supabase address only when sign-in is set up, and only as a plain https origin", () => {
    expect(directive("connect-src").join(" ")).not.toContain("supabase");
    const withDb = buildCsp({ supabaseUrl: "https://abc.supabase.co/rest/v1?x=1" });
    expect(withDb).toContain(" https://abc.supabase.co;");
    expect(withDb).not.toContain("/rest/v1");
    for (const bad of [
      "http://abc.supabase.co",
      "https://u:p@abc.supabase.co",
      "nonsense",
      "",
      null,
    ]) {
      expect(supabaseOrigin(bad)).toBeNull();
    }
  });
});

describe("withSecurityHeaders options", () => {
  it("sends the policy as report-only, on pages only", () => {
    const opts = securityOptionsFromEnv({});
    const page = withSecurityHeaders(html(), opts);
    expect(page.headers.get("Content-Security-Policy-Report-Only")).toBe(opts.cspReportOnly);
    expect(page.headers.get("Content-Security-Policy")).toBeNull();
    const json = withSecurityHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
      opts,
    );
    expect(json.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });

  it("with no options, behaves exactly as before: only the three fixed headers", () => {
    const res = withSecurityHeaders(html());
    expect([...res.headers.keys()].sort()).toEqual(
      [...Object.keys(SECURITY_HEADERS).map((k) => k.toLowerCase()), "content-type"].sort(),
    );
  });

  it("adds X-Robots-Tag only when indexing is off", () => {
    expect(withSecurityHeaders(html()).headers.get("X-Robots-Tag")).toBeNull();
    expect(
      withSecurityHeaders(html(), securityOptionsFromEnv({ SITE_INDEXING: "on" })).headers.get(
        "X-Robots-Tag",
      ),
    ).toBeNull();
    for (const v of ["off", "OFF", "  Off "]) {
      expect(
        withSecurityHeaders(html(), securityOptionsFromEnv({ SITE_INDEXING: v })).headers.get(
          "X-Robots-Tag",
        ),
      ).toBe("noindex, nofollow");
    }
  });

  it("keeps an X-Robots-Tag the response already has", () => {
    const res = withSecurityHeaders(new Response("x", { headers: { "X-Robots-Tag": "all" } }), {
      noindex: true,
    });
    expect(res.headers.get("X-Robots-Tag")).toBe("all");
  });
});

describe("SITE_INDEXING and robots.txt", () => {
  it("only the value off (any case, spaces ignored) turns indexing off", () => {
    expect(indexingOff("off")).toBe(true);
    expect(indexingOff(" OFF ")).toBe(true);
    for (const v of [undefined, null, "", "on", "false", "0", "offf", "no"])
      expect(indexingOff(v)).toBe(false);
  });

  it("is unchanged by default and disallows everything, with no sitemap, when off", () => {
    expect(robotsTxt("https://a.example")).toBe(
      "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://a.example/sitemap.xml\n",
    );
    expect(robotsTxt("https://a.example", false)).toBe(robotsTxt("https://a.example"));
    const off = robotsTxt("https://a.example", true);
    expect(off).toBe("User-agent: *\nDisallow: /\n");
    expect(off).not.toContain("Sitemap");
  });
});

describe("parseCspReports (invented reports)", () => {
  const legacy = (inner: object) => JSON.stringify({ "csp-report": inner });

  it("reads the old report format and keeps only directive, blocked origin and document path", () => {
    const [r] = parseCspReports(
      legacy({
        "document-uri": "https://site.test/about?secret=1#frag",
        "violated-directive": "img-src 'self' data:",
        "effective-directive": "img-src",
        "blocked-uri": "https://evil.test/pixel.png?id=42",
      }),
    );
    expect(r).toEqual({
      directive: "img-src",
      blocked: "https://evil.test",
      documentPath: "/about",
    });
  });

  it("reads the Reporting API format and keywords like inline and eval", () => {
    const out = parseCspReports(
      JSON.stringify([
        {
          type: "csp-violation",
          body: {
            effectiveDirective: "script-src",
            blockedURL: "inline",
            documentURL: "https://site.test/",
          },
        },
        { type: "network-error", body: {} },
        {
          type: "csp-violation",
          body: {
            effectiveDirective: "script-src-elem",
            blockedURL: "eval",
            documentURL: "https://site.test/x",
          },
        },
      ]),
    );
    expect(out).toEqual([
      { directive: "script-src", blocked: "inline", documentPath: "/" },
      { directive: "script-src-elem", blocked: "eval", documentPath: "/x" },
    ]);
  });

  it("limits a body to five reports and rejects empty, oversized and malformed bodies without throwing", () => {
    const many = JSON.stringify(
      Array.from({ length: 9 }, () => ({
        type: "csp-violation",
        body: { effectiveDirective: "img-src", blockedURL: "data", documentURL: "https://s.test/" },
      })),
    );
    expect(parseCspReports(many)).toHaveLength(5);
    expect(parseCspReports("")).toEqual([]);
    expect(parseCspReports("not json")).toEqual([]);
    expect(parseCspReports("x".repeat(MAX_CSP_REPORT_BYTES + 1))).toEqual([]);
    expect(parseCspReports('[1,null,"a"]')).toEqual([]);
    expect(parseCspReports(legacy({ "blocked-uri": "https://x.test" }))).toEqual([]);
  });

  it("cleans odd values: crafted directive text, line breaks and unknown schemes", () => {
    const [r] = parseCspReports(
      legacy({
        "effective-directive": "img-src\n[csp-report] fake line",
        "blocked-uri": "javascript:alert(1)",
        "document-uri": "not a url",
      }),
    );
    expect(r).toEqual({ directive: "img-src", blocked: "javascript", documentPath: "unknown" });
  });
});

describe("readTextLimited", () => {
  const stream = (parts: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p));
        c.close();
      },
    });

  it("reads a body within the limit, across chunks", async () => {
    expect(await readTextLimited(stream(["ab", "cd"]), 10)).toBe("abcd");
    expect(await readTextLimited(null, 10)).toBe("");
  });

  it("gives null as soon as the limit is passed, even without a declared length", async () => {
    expect(await readTextLimited(stream(["aaaa", "bbbb", "cccc"]), 10)).toBeNull();
    expect(
      await readTextLimited(stream(["x".repeat(MAX_CSP_REPORT_BYTES + 1)]), MAX_CSP_REPORT_BYTES),
    ).toBeNull();
  });
});

describe("content type matching", () => {
  it("adds the policy to a page whose content type is written in capitals", () => {
    const res = withSecurityHeaders(
      new Response("x", { headers: { "content-type": "Text/HTML; charset=UTF-8" } }),
      securityOptionsFromEnv({}),
    );
    expect(res.headers.get("Content-Security-Policy-Report-Only")).not.toBeNull();
  });
});
