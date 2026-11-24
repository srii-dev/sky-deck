import { describe, expect, it } from "vitest";
import { z } from "zod";

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
