import { describe, expect, it } from "vitest";
import { z } from "zod";

import { isClientDisconnect } from "@/lib/error-capture";
import { errorStatus } from "@/lib/server-error";

describe("errorStatus", () => {
  it("answers 400 for validation and parse errors", () => {
    const zodError = z.object({ q: z.string() }).safeParse({}).error;
    expect(errorStatus(zodError)).toBe(400);
    expect(errorStatus(new SyntaxError("Unexpected token"))).toBe(400);
    expect(errorStatus({ name: "ZodError" })).toBe(400);
  });

  it("answers 500 for everything else", () => {
    expect(errorStatus(new Error("boom"))).toBe(500);
    expect(errorStatus(null)).toBe(500);
    expect(errorStatus("text")).toBe(500);
  });
});

describe("isClientDisconnect", () => {
  const abort = () => Object.assign(new Error("aborted"), { code: "ECONNRESET" });

  it("spots a browser that dropped the request, also when wrapped as a cause", () => {
    expect(isClientDisconnect(abort())).toBe(true);
    expect(isClientDisconnect(new Error("HTTPError", { cause: abort() }))).toBe(true);
  });

  it("leaves real errors alone", () => {
    expect(isClientDisconnect(new Error("aborted"))).toBe(false);
    expect(
      isClientDisconnect(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })),
    ).toBe(false);
    expect(isClientDisconnect(new Error("boom", { cause: new Error("aborted") }))).toBe(false);
    expect(isClientDisconnect("aborted")).toBe(false);
  });
});
