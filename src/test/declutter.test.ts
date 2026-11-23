import { describe, expect, it } from "vitest";

import { declutter } from "@/lib/declutter";

describe("declutter", () => {
  it("keeps one plane per cell, the highest priority, and every plane in its own cell", () => {
    const shown = declutter(
      [
        { key: "a", x: 1, y: 1, priority: 1 },
        { key: "b", x: 3, y: 2, priority: 5 },
        { key: "c", x: 30, y: 30, priority: 0 },
      ],
      10,
      new Set(),
    );
    expect([...shown].sort()).toEqual(["b", "c"]);
  });

  it("prefers the plane shown last time when priorities tie", () => {
    const items = [
      { key: "a", x: 1, y: 1, priority: 1 },
      { key: "b", x: 2, y: 2, priority: 1 },
    ];
    expect([...declutter(items, 10, new Set(["b"]))]).toEqual(["b"]);
    expect([...declutter(items, 10, new Set(["a"]))]).toEqual(["a"]);
  });
});
