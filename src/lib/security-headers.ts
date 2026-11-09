/*
 * Response headers that tell browsers how to treat the site (Phase 17b). Only headers that cannot break the app are
 * set: no sniffing of file types, a trimmed referrer, and the powerful browser features switched off except the
 * location button. Not set on purpose, until they have been tried in a report-only run: a Content-Security-Policy
 * (the map needs workers, blobs and many tile hosts), frame-ancestors (the Lovable preview embeds the page) and
 * Cross-Origin-Opener-Policy (a later sign-in popup may need it). Pure functions.
 */

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
};

/** The same response with the headers added. A header the response already has is left alone. */
export function withSecurityHeaders(response: Response): Response {
  // Redirects and upgrades carry no page, and some responses have headers that cannot be changed.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  let changed = false;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
      changed = true;
    }
  }
  if (!changed) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
