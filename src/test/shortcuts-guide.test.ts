// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { Aircraft } from "@/lib/aircraft";
import { clampStep, GUIDE_STEPS, shouldAutoShowGuide } from "@/lib/first-run";
import {
  actionForKey,
  escapeTarget,
  isTypingTarget,
  overlayOpen,
  SHORTCUTS,
  stepAircraft,
} from "@/lib/shortcuts";

function ac(hex: string, callsign: string | null, registration: string | null = null): Aircraft {
  return {
    hex,
    callsign,
    registration,
    type: null,
    description: null,
    operator: null,
    lat: 0,
    lon: 0,
    altFt: null,
    onGround: false,
    gs: null,
    track: null,
    vRate: null,
    squawk: null,
    category: null,
    kind: "generic",
    kindLabel: "Aircraft",
    seenPos: 0,
  };
}

describe("actionForKey", () => {
  it("maps plain keys, ignoring case", () => {
    expect(actionForKey({ key: "/" })).toBe("search");
    expect(actionForKey({ key: "N" })).toBe("next");
    expect(actionForKey({ key: "p" })).toBe("previous");
    expect(actionForKey({ key: "Escape" })).toBe("close");
    expect(actionForKey({ key: "?" })).toBe("help");
    expect(actionForKey({ key: "3" })).toBe("trail3d");
  });

  it("leaves browser combinations, repeats and unknown keys alone", () => {
    expect(actionForKey({ key: "t", ctrlKey: true })).toBeNull();
    expect(actionForKey({ key: "t", metaKey: true })).toBeNull();
    expect(actionForKey({ key: "t", altKey: true })).toBeNull();
    expect(actionForKey({ key: "t", repeat: true })).toBeNull();
    expect(actionForKey({ key: "t", defaultPrevented: true })).toBeNull();
    expect(actionForKey({ key: "t", isComposing: true })).toBeNull();
    expect(actionForKey({ key: "z" })).toBeNull();
  });

  it("never uses the keys the map needs", () => {
    for (const k of [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "+",
      "-",
      "=",
      " ",
      "Tab",
    ]) {
      expect(actionForKey({ key: k })).toBeNull();
    }
    expect(new Set(SHORTCUTS.map((s) => s.key)).size).toBe(SHORTCUTS.length);
  });
});

describe("isTypingTarget", () => {
  it("is true in text fields and editable content, false elsewhere", () => {
    document.body.innerHTML = `
      <input id="i" /><textarea id="t"></textarea><select id="s"></select>
      <div contenteditable="true"><span id="c">x</span></div>
      <div role="textbox"><b id="r">x</b></div>
      <button id="b">go</button><div id="d"></div>`;
    for (const id of ["i", "t", "s", "c", "r"]) {
      expect(isTypingTarget(document.getElementById(id))).toBe(true);
    }
    for (const id of ["b", "d"]) expect(isTypingTarget(document.getElementById(id))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("overlayOpen", () => {
  it("sees an open dialog or popover but not a closed one", () => {
    document.body.innerHTML = `<div role="dialog" data-state="closed"></div>`;
    expect(overlayOpen(document)).toBe(false);
    document.body.innerHTML = `<div role="dialog" data-state="open"></div>`;
    expect(overlayOpen(document)).toBe(true);
    document.body.innerHTML = `<div role="alertdialog" data-state="open"></div>`;
    expect(overlayOpen(document)).toBe(true);
  });
});

describe("stepAircraft", () => {
  const list = [ac("c3", "UAL9"), ac("a1", "AAL1"), ac("b2", null, "N5"), ac("d4", null)];

  it("steps through callsign order and wraps around", () => {
    // Order: AAL1, D4 (hex), N5, UAL9
    expect(stepAircraft(list, "a1", 1)?.hex).toBe("d4");
    expect(stepAircraft(list, "d4", 1)?.hex).toBe("b2");
    expect(stepAircraft(list, "c3", 1)?.hex).toBe("a1");
    expect(stepAircraft(list, "a1", -1)?.hex).toBe("c3");
  });

  it("starts at the first or last aircraft when nothing is selected", () => {
    expect(stepAircraft(list, null, 1)?.hex).toBe("a1");
    expect(stepAircraft(list, null, -1)?.hex).toBe("c3");
    expect(stepAircraft(list, "gone", 1)?.hex).toBe("a1");
  });

  it("returns null for an empty list and the same aircraft for a list of one", () => {
    expect(stepAircraft([], null, 1)).toBeNull();
    expect(stepAircraft([ac("a1", "X")], "a1", 1)?.hex).toBe("a1");
  });
});

describe("escapeTarget", () => {
  it("closes the ruler first, then the aircraft, the nearby list and the airport", () => {
    const all = { ruler: true, aircraft: true, nearby: true, airport: true };
    expect(escapeTarget(all)).toBe("ruler");
    expect(escapeTarget({ ...all, ruler: false })).toBe("aircraft");
    expect(escapeTarget({ ...all, ruler: false, aircraft: false })).toBe("nearby");
    expect(escapeTarget({ ruler: false, aircraft: false, nearby: false, airport: true })).toBe(
      "airport",
    );
    expect(
      escapeTarget({ ruler: false, aircraft: false, nearby: false, airport: false }),
    ).toBeNull();
  });
});

describe("first-run guide", () => {
  it("shows once, and not over a shared link", () => {
    expect(shouldAutoShowGuide(false, "")).toBe(true);
    expect(shouldAutoShowGuide(false, "?mock=1")).toBe(true);
    expect(shouldAutoShowGuide(true, "")).toBe(false);
    expect(shouldAutoShowGuide(false, "?lat=40&lon=-74&z=9")).toBe(false);
    expect(shouldAutoShowGuide(false, "?hex=a835af")).toBe(false);
    expect(shouldAutoShowGuide(false, "?base=satellite")).toBe(false);
  });

  it("has a few short steps and clamps the step index", () => {
    expect(GUIDE_STEPS.length).toBeGreaterThanOrEqual(3);
    expect(GUIDE_STEPS.length).toBeLessThanOrEqual(6);
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99)).toBe(GUIDE_STEPS.length - 1);
    expect(clampStep(1.7)).toBe(1);
  });
});
