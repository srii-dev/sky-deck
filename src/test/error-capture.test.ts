import { afterEach, describe, expect, it, vi } from "vitest";

const abort = () => Object.assign(new Error("aborted"), { code: "ECONNRESET" });

// error-capture wraps console.error when it is first imported, so each test installs fresh spies and re-imports it.
async function load() {
  vi.resetModules();
  const error = vi.fn();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  console.error = error;
  const mod = await import("@/lib/error-capture");
  return { mod, error, warn };
}

const realError = console.error;
afterEach(() => {
  console.error = realError;
  vi.restoreAllMocks();
});

describe("console.error wrapper", () => {
  it("logs a dropped request as one warning and keeps it for server.ts", async () => {
    const { mod, error, warn } = await load();
    const dropped = new Error("HTTPError", { cause: abort() });
    console.error(dropped);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(mod.isClientDisconnect(mod.consumeLastCapturedError())).toBe(true);
  });

  it("still logs a real error passed in the same call", async () => {
    const { error, warn } = await load();
    console.error("context", abort(), new Error("boom"));
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[2])).toContain("boom");
  });

  it("logs ordinary errors in full", async () => {
    const { error } = await load();
    console.error(new Error("boom", { cause: new Error("root") }));
    expect(String(error.mock.calls[0]?.[0])).toContain("caused by: Error: root");
  });
});
