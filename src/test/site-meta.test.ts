import { describe, expect, it } from "vitest";

import {
  canonicalUrl,
  normalizeSiteUrl,
  robotsTxt,
  SITEMAP_PATHS,
  sitemapXml,
  webApplicationJsonLd,
} from "@/lib/site-meta";

describe("normalizeSiteUrl", () => {
  it("keeps only a clean origin", () => {
    expect(normalizeSiteUrl("https://skydeck.example/")).toBe("https://skydeck.example");
    expect(normalizeSiteUrl(" https://skydeck.example/map?x=1#y ")).toBe("https://skydeck.example");
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("rejects empty, malformed, insecure and credentialed values", () => {
    for (const v of [
      "",
      "   ",
      null,
      undefined,
      "skydeck.example",
      "http://skydeck.example",
      "javascript:alert(1)",
      "https://user:pw@skydeck.example",
    ]) {
      expect(normalizeSiteUrl(v)).toBeNull();
    }
  });
});

describe("canonicalUrl", () => {
  it("joins the site and the path without a query, fragment or trailing slash", () => {
    const s = "https://skydeck.example";
    expect(canonicalUrl(s, "/")).toBe("https://skydeck.example/");
    expect(canonicalUrl(s, "/inspector/")).toBe("https://skydeck.example/inspector");
    expect(canonicalUrl(s, "/?lat=1&lon=2#x")).toBe("https://skydeck.example/");
    expect(canonicalUrl(s, "inspector")).toBe("https://skydeck.example/inspector");
  });

  it("is null without a site address", () => {
    expect(canonicalUrl(null, "/")).toBeNull();
  });
});

describe("sitemapXml and robotsTxt", () => {
  it("lists every page once, with absolute addresses", () => {
    const xml = sitemapXml("https://skydeck.example");
    for (const p of SITEMAP_PATHS)
      expect(xml).toContain("<loc>https://skydeck.example" + p + "</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(SITEMAP_PATHS.length);
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it("escapes markup characters in addresses", () => {
    expect(sitemapXml("https://skydeck.example", ["/a&b"])).toContain("/a&amp;b");
  });

  it("allows crawling pages, keeps crawlers off the API and points at the sitemap when it can", () => {
    const withSite = robotsTxt("https://skydeck.example");
    expect(withSite).toContain("Allow: /");
    expect(withSite).toContain("Disallow: /api/");
    expect(withSite).toContain("Sitemap: https://skydeck.example/sitemap.xml");
    expect(robotsTxt(null)).not.toContain("Sitemap");
  });
});

describe("webApplicationJsonLd", () => {
  it("is valid JSON that describes the app, and never closes the script element", () => {
    const text = webApplicationJsonLd({
      name: "SkyDeck",
      description: "Live </script><b>x",
      site: "https://skydeck.example",
    });
    expect(text).not.toContain("<");
    const data = JSON.parse(text) as Record<string, unknown>;
    expect(data["@type"]).toBe("WebApplication");
    expect(data["name"]).toBe("SkyDeck");
    expect(data["url"]).toBe("https://skydeck.example/");
    expect(data["description"]).toBe("Live </script><b>x");
  });

  it("leaves the address out when there is none", () => {
    const data = JSON.parse(
      webApplicationJsonLd({ name: "A", description: "B", site: null }),
    ) as Record<string, unknown>;
    expect("url" in data).toBe(false);
  });
});
