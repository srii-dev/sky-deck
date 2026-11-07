import { describe, expect, it } from "vitest";
import {
  CLIENT_ERROR_LIMITS,
  cleanClientError,
  createDedupe,
  createReportLimiter,
  describeError,
  stripQuery,
} from "@/lib/client-error";

describe("client error reports", () => {
  it("strips query strings and fragments from paths and URLs", () => {
    expect(stripQuery("/map?hex=abc123&x=1#top")).toBe("/map");
    expect(stripQuery("at fn (http://localhost:8080/src/a.ts?t=123:4:5)")).toBe(
      "at fn (http://localhost:8080/src/a.ts)",
    );
  });

  it("cuts long fields and keeps short ones as they are", () => {
    const r = cleanClientError({
      message: "m".repeat(CLIENT_ERROR_LIMITS.message + 50),
      stack: "s".repeat(CLIENT_ERROR_LIMITS.stack + 50),
      boundary: "root",
      path: "/inspector?frames=8D4840D6",
    });
    expect(r.message.length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.message + 1);
    expect(r.stack!.length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.stack + 1);
    expect(r.boundary).toBe("root");
    expect(r.path).toBe("/inspector");
  });

  it("leaves out fields that were not given", () => {
    expect(cleanClientError({ message: "boom" })).toEqual({ message: "boom" });
  });

  it("describes errors, strings and plain objects", () => {
    expect(describeError(new Error("x")).message).toBe("x");
    expect(describeError("plain").message).toBe("plain");
    expect(describeError({ code: 5 }).message).toBe('{"code":5}');
  });

  it("limits reports per window", () => {
    const l = createReportLimiter(3, 60_000);
    expect([l.allow(0), l.allow(1), l.allow(2), l.allow(3)]).toEqual([true, true, true, false]);
    expect(l.allow(60_001)).toBe(true); // the first three have left the window
  });

  it("skips the same message inside the dedupe window only", () => {
    const send = createDedupe(1000);
    expect(send("a", 0)).toBe(true);
    expect(send("a", 500)).toBe(false);
    expect(send("b", 500)).toBe(true);
    expect(send("a", 1501)).toBe(true);
  });
});
