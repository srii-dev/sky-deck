import { afterEach, describe, expect, it } from "vitest";
import {
  browserFlags,
  FLAG_DEFAULTS,
  FLAGS_STORAGE_KEY,
  parseFlagList,
  resolveFlags,
  serverFlags,
} from "@/lib/flags";

afterEach(() => {
  localStorage.clear();
});

describe("feature flags", () => {
  it("parses comma and space separated names, with - for off", () => {
    const p = parseFlagList("labs, other  -third");
    expect([...p.on].sort()).toEqual(["labs", "other"]);
    expect([...p.off]).toEqual(["third"]);
    expect(parseFlagList(null).on.size).toBe(0);
  });

  it("starts from the defaults", () => {
    expect(resolveFlags()).toEqual(FLAG_DEFAULTS);
    expect(resolveFlags(undefined, null, "")).toEqual(FLAG_DEFAULTS);
  });

  it("switches a flag on, off, and lets later lists win", () => {
    expect(resolveFlags("labs").labs).toBe(true);
    expect(resolveFlags("labs", "-labs").labs).toBe(false);
    expect(resolveFlags("-labs", "labs").labs).toBe(true);
  });

  it("ignores names that are not registered", () => {
    expect(resolveFlags("nope, -alsoNope")).toEqual(FLAG_DEFAULTS);
  });

  it("applies the list stored in the browser, but not on the server", () => {
    localStorage.setItem(FLAGS_STORAGE_KEY, "labs");
    expect(browserFlags().labs).toBe(true);
    expect(serverFlags().labs).toBe(false);
  });
});
