import { describe, expect, it } from "vitest";

import {
  ALERT_RGB,
  CARD_GRADIENT_STRENGTH,
  classifyAcars,
  visibleMessages,
  type AcarsAlert,
} from "@/lib/acars-alert";
import { buildAcarsReport } from "@/lib/acars-report";
import type { AcarsMessage } from "@/lib/acars-messages";

/* All messages here are INVENTED. */
const msg = (over: Partial<AcarsMessage> = {}): AcarsMessage => ({
  id: 1,
  time: 0,
  tail: "N000XX",
  flight: "TST123",
  label: "H1",
  fromHex: null,
  toHex: null,
  frequency: null,
  sourceType: null,
  departing: null,
  destination: null,
  text: "TEST MESSAGE",
  ...over,
});

describe("visibleMessages", () => {
  const alertOf = (m: AcarsMessage) => classifyAcars(m);

  it("folds exact duplicates into the first (newest) row", () => {
    const r = visibleMessages(
      [msg({ id: 3 }), msg({ id: 2 }), msg({ id: 1, text: "OTHER" })],
      alertOf,
      "all",
    );
    expect(r.shown.map((m) => m.id)).toEqual([3, 1]);
    expect(r.duplicates).toBe(1);
  });

  it("keeps rows that differ in flight or label", () => {
    const r = visibleMessages(
      [msg({ id: 3 }), msg({ id: 2, flight: "TST999" }), msg({ id: 1, label: "5Z" })],
      alertOf,
      "all",
    );
    expect(r.shown).toHaveLength(3);
  });

  it("leaves rows without text out, but keeps cautions and emergencies", () => {
    const rows = [msg({ id: 3, text: "", label: "5Z" }), msg({ id: 2 })];
    const r = visibleMessages(rows, alertOf, "all");
    expect(r.shown.map((m) => m.id)).toEqual([2]);
    expect(r.empty).toBe(1);
    const kept = visibleMessages(rows, (m) => (m.text ? "routine" : "emergency"), "all");
    expect(kept.shown).toHaveLength(2);
  });

  it("still applies the filter", () => {
    const r = visibleMessages([msg({ id: 1 })], alertOf, "breaking");
    expect(r.shown).toEqual([]);
  });
});

describe("report while the AI is writing", () => {
  it("says Writing instead of Not available, and drops the no-explanation note once explained", () => {
    const m = msg({ text: "ZZZ QQQ" });
    const writing = buildAcarsReport(m, "routine", null, null, { brief: true, detail: true });
    expect(writing).not.toContain("Not available");
    expect(writing).toContain("## Explanation (AI-generated)\n\nWriting...");
    expect(writing).toContain("No explanation available");
    const done = buildAcarsReport(m, "routine", "Brief.", "Full story.");
    expect(done).not.toContain("No explanation available");
  });
});

/* WCAG contrast of white/70 text on the card, in the worst case: a white map behind a 90 percent black card. */
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r: number[]) => 0.2126 * lin(r[0]!) + 0.7152 * lin(r[1]!) + 0.0722 * lin(r[2]!);
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mix = (fg: number[], a: number, bg: number[]) => fg.map((v, i) => v * a + bg[i]! * (1 - a));

describe("card text contrast", () => {
  for (const alert of Object.keys(ALERT_RGB) as AcarsAlert[]) {
    it(alert + ": white/70 stays at 4.5:1 or better at the strongest point of the gradient", () => {
      const card = mix([0, 0, 0], 0.9, [255, 255, 255]);
      const bg = mix(ALERT_RGB[alert].split(",").map(Number), CARD_GRADIENT_STRENGTH[alert], card);
      const text = mix([255, 255, 255], 0.7, bg);
      expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
