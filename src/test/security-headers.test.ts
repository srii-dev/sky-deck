import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS, httpsRedirectTarget, withSecurityHeaders } from "@/lib/security-headers";

describe("httpsRedirectTarget", () => {
  const none = () => null;
  it("sends plain http on a public host to https, keeping path and query", () => {
    expect(httpsRedirectTarget("http://skydeck.sky-deck.workers.dev/a?b=1", none)).toBe(
      "https://skydeck.sky-deck.workers.dev/a?b=1",
    );
  });
  it("leaves https alone", () => {
    expect(httpsRedirectTarget("https://skydeck.sky-deck.workers.dev/", none)).toBeNull();
  });
  it("never redirects local hosts, so wrangler dev and the CI worker tests keep working", () => {
    for (const u of ["http://127.0.0.1:8787/", "http://localhost:3000/", "http://[::1]:8787/"]) {
      expect(httpsRedirectTarget(u, none)).toBeNull();
      expect(httpsRedirectTarget(u, () => '{"scheme":"http"}')).toBeNull();
    }
  });
  it("trusts cf-visitor and x-forwarded-proto over the URL scheme", () => {
    const url = "https://example.workers.dev/x";
    expect(httpsRedirectTarget(url, (n) => (n === "cf-visitor" ? '{"scheme":"http"}' : null))).toBe(
      "https://example.workers.dev/x",
    );
    expect(
      httpsRedirectTarget(url, (n) => (n === "x-forwarded-proto" ? "http, https" : null)),
    ).toBe("https://example.workers.dev/x");
    expect(
      httpsRedirectTarget("http://example.workers.dev/", (n) =>
        n === "cf-visitor" ? '{"scheme":"https"}' : null,
      ),
    ).toBeNull();
  });
  it("ignores a garbled cf-visitor and a bad URL", () => {
    expect(
      httpsRedirectTarget("http://example.com/", (n) => (n === "cf-visitor" ? "{" : null)),
    ).toBe("https://example.com/");
    expect(httpsRedirectTarget("not a url", none)).toBeNull();
  });
});

describe("withSecurityHeaders", () => {
  it("adds the headers and keeps the body, status and other headers", async () => {
    const res = withSecurityHeaders(
      new Response("hello", {
        status: 404,
        headers: { "content-type": "text/plain", "x-keep": "1" },
      }),
    );
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k)).toBe(v);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("x-keep")).toBe("1");
    expect(await res.text()).toBe("hello");
  });

  it("does not overwrite a header the response already has", () => {
    const res = withSecurityHeaders(
      new Response("x", { headers: { "Referrer-Policy": "no-referrer" } }),
    );
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns the same response when nothing needs adding", () => {
    const full = new Response("x", { headers: SECURITY_HEADERS as Record<string, string> });
    expect(withSecurityHeaders(full)).toBe(full);
  });

  it("keeps location available to the page and switches off camera and microphone", () => {
    const p = SECURITY_HEADERS["Permissions-Policy"]!;
    expect(p).toContain("geolocation=(self)");
    expect(p).toContain("camera=()");
    expect(p).toContain("microphone=()");
  });

  it("sends HSTS for this host only, with no includeSubDomains or preload", () => {
    const h = SECURITY_HEADERS["Strict-Transport-Security"]!;
    expect(h).toBe("max-age=31536000");
    expect(h).not.toMatch(/includeSubDomains|preload/i);
  });

  it("does not set headers that could break the app", () => {
    const names = Object.keys(SECURITY_HEADERS).map((n) => n.toLowerCase());
    for (const risky of [
      "content-security-policy",
      "x-frame-options",
      "cross-origin-opener-policy",
    ]) {
      expect(names).not.toContain(risky);
    }
  });
});
