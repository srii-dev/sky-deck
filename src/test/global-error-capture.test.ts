import { describe, expect, it } from "vitest";

import {
  installGlobalErrorCapture,
  isNoise,
  MAX_GLOBAL_REPORTS_PER_PAGE,
  type CaptureTarget,
} from "@/lib/global-error-capture";

function fakeWindow() {
  const handlers: Record<string, ((e: unknown) => void)[]> = {};
  const target: CaptureTarget = {
    addEventListener: (t, l) => void (handlers[t] ??= []).push(l),
    removeEventListener: (t, l) => {
      handlers[t] = (handlers[t] ?? []).filter((x) => x !== l);
    },
  };
  const fire = (type: string, event: unknown) => (handlers[type] ?? []).forEach((h) => h(event));
  return { target, fire, count: (t: string) => (handlers[t] ?? []).length };
}

function setup() {
  const w = fakeWindow();
  const sent: { error: unknown; boundary: string }[] = [];
  const stop = installGlobalErrorCapture(w.target, (error, boundary) =>
    sent.push({ error, boundary }),
  );
  return { w, sent, stop };
}

describe("global error capture", () => {
  it("reports a script error and an unhandled rejection with their own boundary names", () => {
    const { w, sent } = setup();
    const err = new Error("boom");
    w.fire("error", { error: err, message: "boom", filename: "https://app.test/assets/app.js" });
    const reason = new Error("rejected");
    w.fire("unhandledrejection", { reason });
    expect(sent).toEqual([
      { error: err, boundary: "window-error" },
      { error: reason, boundary: "unhandled-rejection" },
    ]);
  });

  it("falls back to the message text when there is no error object", () => {
    const { w, sent } = setup();
    w.fire("error", { message: "Something failed" });
    w.fire("unhandledrejection", { reason: undefined });
    expect(sent[0]).toEqual({ error: "Something failed", boundary: "window-error" });
    expect(sent[1]).toEqual({
      error: "Unhandled promise rejection",
      boundary: "unhandled-rejection",
    });
  });

  it("drops noise: resize loops, cross-origin script errors, aborts and extension code", () => {
    const { w, sent } = setup();
    w.fire("error", { message: "ResizeObserver loop completed with undelivered notifications." });
    w.fire("error", { message: "Script error." });
    w.fire("error", { message: "x", filename: "chrome-extension://abc/content.js" });
    w.fire("unhandledrejection", { reason: new Error("The operation was aborted.") });
    w.fire("unhandledrejection", { reason: "AbortError: fetch aborted" });
    expect(sent).toEqual([]);
    expect(isNoise("A real problem")).toBe(false);
    expect(isNoise("A real problem", "https://app.test/assets/a.js")).toBe(false);
  });

  it("sends at most a few reports per page", () => {
    const { w, sent } = setup();
    for (let i = 0; i < 20; i++) w.fire("error", { message: "failure " + i });
    expect(sent).toHaveLength(MAX_GLOBAL_REPORTS_PER_PAGE);
  });

  it("stops listening when asked", () => {
    const { w, sent, stop } = setup();
    expect(w.count("error")).toBe(1);
    expect(w.count("unhandledrejection")).toBe(1);
    stop();
    expect(w.count("error")).toBe(0);
    expect(w.count("unhandledrejection")).toBe(0);
    w.fire("error", { message: "late" });
    expect(sent).toEqual([]);
  });
});
