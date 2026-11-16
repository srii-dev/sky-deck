import { describe, expect, it } from "vitest";

import {
  canonicalUrl,
  normalizeSiteUrl,
  pageMeta,
  robotsTxt,
  shareMeta,
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

describe("pageMeta and shareMeta (link previews)", () => {
  const find = (tags: Record<string, string>[], key: string, value: string) =>
    tags.find((t) => t[key] === value)?.["content"];

  it("gives the preview text the same title and description as the page", () => {
    const tags = pageMeta("About — SkyDeck", "What it is.") as Record<string, string>[];
    expect(tags[0]).toEqual({ title: "About — SkyDeck" });
    expect(find(tags, "name", "description")).toBe("What it is.");
    expect(find(tags, "property", "og:title")).toBe("About — SkyDeck");
    expect(find(tags, "property", "og:description")).toBe("What it is.");
    expect(find(tags, "name", "twitter:title")).toBe("About — SkyDeck");
    expect(find(tags, "name", "twitter:description")).toBe("What it is.");
  });

  it("writes absolute address and image tags when SITE_URL is set", () => {
    const tags = shareMeta({
      site: "https://s.example",
      pathname: "/about",
      siteName: "SkyDeck",
    }) as Record<string, string>[];
    expect(find(tags, "property", "og:url")).toBe("https://s.example/about");
    expect(find(tags, "property", "og:image")).toBe("https://s.example/og-image.png");
    expect(find(tags, "name", "twitter:image")).toBe("https://s.example/og-image.png");
    expect(find(tags, "property", "og:image:width")).toBe("1200");
    expect(find(tags, "property", "og:image:height")).toBe("630");
    expect(find(tags, "property", "og:site_name")).toBe("SkyDeck");
    expect(find(tags, "name", "twitter:card")).toBe("summary_large_image");
    for (const t of tags)
      if ("content" in t && /^(og:(url|image)|twitter:image)$/.test(String(Object.values(t)[0])))
        expect(t["content"]).toMatch(/^https:\/\//);
  });

  it("writes no address or image tag without SITE_URL, never a relative one", () => {
    const tags = shareMeta({ site: null, pathname: "/about", siteName: "SkyDeck" }) as Record<
      string,
      string
    >[];
    expect(find(tags, "property", "og:url")).toBeUndefined();
    expect(find(tags, "property", "og:image")).toBeUndefined();
    expect(find(tags, "name", "twitter:image")).toBeUndefined();
    expect(find(tags, "name", "twitter:card")).toBe("summary_large_image");
  });

  it("gives the home address for the map page and leaves the address out for unknown pages", () => {
    const map = shareMeta({
      site: "https://s.example",
      pathname: "/",
      siteName: "SkyDeck",
    }) as Record<string, string>[];
    expect(find(map, "property", "og:url")).toBe("https://s.example/");
    const missing = shareMeta({
      site: "https://s.example",
      pathname: "/no-such-page",
      siteName: "SkyDeck",
    }) as Record<string, string>[];
    expect(find(missing, "property", "og:url")).toBeUndefined();
    expect(find(missing, "property", "og:image")).toBe("https://s.example/og-image.png");
  });
});

describe("shareMeta without a page path", () => {
  it("writes the image but no page address when the path is unknown (a missing page)", () => {
    const tags = shareMeta({
      site: "https://s.example",
      pathname: null,
      siteName: "SkyDeck",
    }) as Record<string, string>[];
    expect(tags.find((t) => t["property"] === "og:url")).toBeUndefined();
    expect(tags.find((t) => t["property"] === "og:image")?.["content"]).toBe(
      "https://s.example/og-image.png",
    );
  });
});
