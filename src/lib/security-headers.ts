/*
 * Response headers that tell browsers how to treat the site (Phase 17b). Only headers that cannot break the app are
 * set: no sniffing of file types, a trimmed referrer, and the powerful browser features switched off except the
 * location button. A Content-Security-Policy is sent in report-only mode (csp.ts). Not set on purpose:
 * an enforcing Content-Security-Policy (needs nonces first, see csp.ts), frame-ancestors (embedding the page is a feature) and
 * Cross-Origin-Opener-Policy (a later sign-in popup may need it). Pure functions.
 */

import { buildCsp } from "./csp";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
};

export interface SecurityOptions {
  /** Ask search engines to leave every page out (SITE_INDEXING=off), for a preview that is not launched. */
  noindex?: boolean;
  /** A Content-Security-Policy to send in report-only mode on HTML pages (see csp.ts). */
  cspReportOnly?: string | null;
}

/** True when the SITE_INDEXING setting asks to keep the site out of search engines (any letter case, spaces ignored). */
export function indexingOff(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "off";
}

/** The per-request options from the server's environment variables. */
export function securityOptionsFromEnv(env: Record<string, string | undefined>): SecurityOptions {
  return {
    noindex: indexingOff(env["SITE_INDEXING"]),
    cspReportOnly: buildCsp({ supabaseUrl: env["SUPABASE_URL"] }),
  };
}

/** The same response with the headers added. A header the response already has is left alone. */
export function withSecurityHeaders(response: Response, options: SecurityOptions = {}): Response {
  // Redirects and upgrades carry no page, and some responses have headers that cannot be changed.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  let changed = false;
  const set = (name: string, value: string) => {
    if (!headers.has(name)) {
      headers.set(name, value);
      changed = true;
    }
  };
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) set(name, value);
  if (options.noindex) set("X-Robots-Tag", "noindex, nofollow");
  if (
    options.cspReportOnly &&
    (headers.get("content-type") ?? "").toLowerCase().includes("text/html")
  ) {
    set("Content-Security-Policy-Report-Only", options.cspReportOnly);
  }
  if (!changed) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
