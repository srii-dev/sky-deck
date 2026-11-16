/*
 * Content-Security-Policy (Phase 17b), sent in REPORT-ONLY mode: the browser tells us about violations but blocks
 * nothing. Pure functions. The list of outside addresses below comes from a real session on the production build
 * (basemaps, satellite, terrain, radar, echo tops, ACARS) plus the code; every entry says which feature needs it.
 *
 * Why it cannot be enforced yet: the server-rendered page carries inline scripts (the theme script, TanStack Start's
 * hydration data) and React and MapLibre set style attributes, so script-src and style-src need 'unsafe-inline'.
 * Enforcing a strict policy needs a per-response nonce on those scripts first. Until then this policy only watches
 * the outside addresses, which is the part that catches a hijacked or mistyped tile or API address.
 * frame-ancestors is not set on purpose: embedding the map is a feature (embed=1).
 */

/** Addresses the browser fetches from. */
export const CSP_CONNECT_ORIGINS = [
  "https://tiles.openfreemap.org", // basemap styles, vector tiles, fonts and sprites (Dark and Light)
  "https://server.arcgisonline.com", // Satellite imagery tiles
  "https://s3.amazonaws.com", // terrain elevation tiles (AWS Terrarium)
  "https://api.rainviewer.com", // radar frame list
  "https://tilecache.rainviewer.com", // radar tiles
  "https://mesonet.agron.iastate.edu", // echo tops (Iowa State Mesonet WMS)
  "https://api.airframes.io", // ACARS messages, on demand from the browser
] as const;

/** The origin of a Supabase project address, or null when it is not a plain https address. */
export function supabaseOrigin(value: string | null | undefined): string | null {
  try {
    const u = new URL((value ?? "").trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

export interface CspOptions {
  /** SUPABASE_URL when sign-in is set up: the browser talks to it directly. */
  supabaseUrl?: string | null | undefined;
  /** Where violation reports go. */
  reportUri?: string;
}

export function buildCsp(opts: CspOptions = {}): string {
  const supabase = supabaseOrigin(opts.supabaseUrl);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...CSP_CONNECT_ORIGINS, ...(supabase ? [supabase] : [])]],
    ["worker-src", ["'self'", "blob:"]], // MapLibre runs its tile workers from a blob
    ["manifest-src", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  parts.push(`report-uri ${opts.reportUri ?? "/api/csp-report"}`);
  return parts.join("; ");
}
