import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS, withSecurityHeaders } from "@/lib/security-headers";

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
