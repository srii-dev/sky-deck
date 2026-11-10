/*
 * Page metadata and search files (Phase 15g): the public address of the site, canonical links, sitemap.xml,
 * robots.txt and the structured data of the map page. The address comes from the optional SITE_URL server variable;
 * until the site has a domain (Phase 16) there is none, and then no canonical link is written. Pure functions.
 */

/**
 * Links from the site header into the map page (Phase 15d): the map opens with the search box focused, or with the
 * account dialog open. The map page removes the parameter from the address once it has acted on it.
 */
export const MAP_ACTIONS = {
  search: "/?open=search",
  account: "/?open=account",
} as const;

/** Which header action an address asks for, or null. Only the two known values count. */
export function mapActionFromSearch(search: string): "search" | "account" | null {
  try {
    const v = new URLSearchParams(search).get("open");
    return v === "search" || v === "account" ? v : null;
  } catch {
    return null;
  }
}

/** The same address without the open parameter (other parameters are kept). */
export function withoutMapAction(search: string): string {
  const p = new URLSearchParams(search);
  p.delete("open");
  const q = p.toString();
  return q ? "?" + q : "";
}

/** The pages a visitor can open, for the sitemap. */
export const SITEMAP_PATHS: readonly string[] = [
  "/",
  "/inspector",
  "/about",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/help",
  "/whats-new",
  "/press",
  "/status",
];

/** A clean origin (https, or http for localhost) from a variable, or null when it is empty or unusable. */
export function normalizeSiteUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
  if (u.username || u.password) return null;
  return u.origin;
}

/** The canonical address of a page, without the query or fragment. Null without a site address. */
export function canonicalUrl(site: string | null, pathname: string): string | null {
  if (!site) return null;
  let p = pathname.split("?")[0]!.split("#")[0]!;
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return site + p;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sitemapXml(site: string, paths: readonly string[] = SITEMAP_PATHS): string {
  const urls = paths
    .map((p) => "  <url><loc>" + escapeXml(canonicalUrl(site, p) ?? site) + "</loc></url>")
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    "\n</urlset>\n"
  );
}

/** Everything may be crawled except the server endpoints, which are not pages. */
export function robotsTxt(site: string | null): string {
  const lines = ["User-agent: *", "Allow: /", "Disallow: /api/", ""];
  if (site) lines.push("Sitemap: " + site + "/sitemap.xml", "");
  return lines.join("\n");
}

/** schema.org description of the app, as the JSON text of an ld+json script. */
export function webApplicationJsonLd(opts: {
  name: string;
  description: string;
  site: string | null;
}): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: opts.name,
    description: opts.description,
    applicationCategory: "TravelApplication",
    operatingSystem: "Any (web browser)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  if (opts.site) data["url"] = opts.site + "/";
  // "<" is escaped so the text can never close the script element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
