/*
 * Embeddable map (Phase 24f): the map page with `embed=1` in its address shows only the map, with a small link back to
 * the full app. This module reads the flag and builds the snippet a site owner pastes into their page. Pure functions.
 */

export function isEmbed(search: string): boolean {
  try {
    return new URLSearchParams(search).get("embed") === "1";
  } catch {
    return false;
  }
}

const attr = (v: string) =>
  v
    .split("&")
    .join("&amp;")
    .split('"')
    .join("&quot;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;");

/** The address of the same view, as an embedded map. Null for anything that is not a web address. */
export function embedUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.searchParams.set("embed", "1");
  // The selected aircraft is not part of a shared embed: it is a view of an area.
  u.searchParams.delete("hex");
  u.hash = "";
  return u.toString();
}

/** An iframe tag for the current view, or null when the address cannot be embedded. */
export function embedCode(href: string, width = 640, height = 420): string | null {
  const src = embedUrl(href);
  if (!src) return null;
  const w = Math.max(200, Math.min(2000, Math.round(width)));
  const h = Math.max(200, Math.min(2000, Math.round(height)));
  return (
    '<iframe src="' +
    attr(src) +
    '" width="' +
    w +
    '" height="' +
    h +
    '" style="border:0" loading="lazy" allow="geolocation" title="SkyDeck live aircraft map"></iframe>'
  );
}
