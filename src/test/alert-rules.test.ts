import { describe, expect, it } from "vitest";
import {
  addRule,
  cleanConditions,
  countMatches,
  describeConditions,
  evaluateRules,
  hasConditions,
  matchesRule,
  MAX_ALERT_RULES,
  MAX_EVENTS_PER_RULE,
  newRuleState,
  removeRule,
  RULE_COOLDOWN_MS,
  sanitizeRules,
  setRuleEnabled,
  type AlertRule,
  type RuleAircraft,
  type RuleConditions,
  type RuleState,
} from "@/lib/alert-rules";
import { parseAltitudeFt, parseRuleText, type PlaceResolver } from "@/lib/alert-rule-parser";

function ac(p: Partial<RuleAircraft> = {}): RuleAircraft {
  return {
    hex: "abc123",
    callsign: "UAL123",
    type: "B77W",
    kind: "widebody",
    lat: 40.64,
    lon: -73.78,
    altFt: 4000,
    onGround: false,
    squawk: "1200",
    seenPos: 1,
    ...p,
  };
}

describe("rule conditions", () => {
  it("cleans and validates conditions", () => {
    const c = cleanConditions({
      callsignPrefix: " ual-1 ",
      kinds: ["widebody", "bogus", "widebody"],
      military: true,
      altMinFt: 1000.4,
      altMaxFt: -5,
      squawk: "7700",
      area: { lat: 40, lon: -74, radiusNm: 25.04, label: "  JFK " },
    });
    expect(c).toEqual({
      callsignPrefix: "UAL1",
      kinds: ["widebody"],
      military: true,
      altMinFt: 1000,
      squawk: "7700",
      area: { lat: 40, lon: -74, radiusNm: 25, label: "JFK" },
    });
    expect(cleanConditions({ squawk: "7800", area: { lat: 99, lon: 0, radiusNm: 5 } })).toEqual({});
    expect(cleanConditions({ area: { lat: 0, lon: 0, radiusNm: 5000 } })).toEqual({});
    expect(cleanConditions(null)).toEqual({});
  });

  it("needs at least one condition", () => {
    expect(hasConditions({})).toBe(false);
    expect(hasConditions({ military: true })).toBe(true);
    expect(addRule([], { name: "x", conditions: {} }, 1)).toBeNull();
    expect(
      addRule([], { name: "x", conditions: { altMinFt: 5000, altMaxFt: 1000 } }, 1),
    ).toBeNull();
  });

  it("adds, switches off and removes rules, with a limit", () => {
    let list: AlertRule[] = [];
    list = addRule(list, { name: "", conditions: { military: true } }, 1000, 0.5)!;
    expect(list[0]?.name).toBe("military aircraft");
    const id = list[0]!.id;
    expect(setRuleEnabled(list, id, false)[0]?.enabled).toBe(false);
    expect(removeRule(list, id)).toEqual([]);
    for (let i = 0; i < MAX_ALERT_RULES - 1; i++) {
      list = addRule(list, { name: "r" + i, conditions: { military: true } }, 2000 + i, i / 100)!;
    }
    expect(list).toHaveLength(MAX_ALERT_RULES);
    expect(addRule(list, { name: "one more", conditions: { military: true } }, 9999)).toBeNull();
  });

  it("cleans stored rules", () => {
    const out = sanitizeRules([
      { id: "a", name: "  ok  ", enabled: false, createdAt: 5, conditions: { military: true } },
      { id: "a", name: "dup", conditions: { military: true } },
      { id: "b", conditions: {} },
      { id: "c", conditions: { altMinFt: 9000, altMaxFt: 1000 } },
      { name: "no id", conditions: { military: true } },
      "junk",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "a", name: "ok", enabled: false });
    expect(sanitizeRules("x")).toEqual([]);
  });

  it("describes rules in plain English", () => {
    expect(
      describeConditions({
        kinds: ["widebody"],
        altMaxFt: 5000,
        area: { lat: 0, lon: 0, radiusNm: 40, label: "JFK" },
      }),
    ).toBe("heavy jet, below 5,000 ft, within 40 nm of JFK");
    expect(describeConditions({ altMinFt: 1000, altMaxFt: 3000, airborne: true })).toBe(
      "in the air, between 1,000 ft and 3,000 ft",
    );
    expect(describeConditions({})).toBe("no conditions");
  });
});

describe("matching", () => {
  const jfk = { lat: 40.6413, lon: -73.7781, radiusNm: 40, label: "JFK" };

  it("needs every condition", () => {
    const c: RuleConditions = { kinds: ["widebody"], altMaxFt: 5000, area: jfk };
    expect(matchesRule(c, ac())).toBe(true);
    expect(matchesRule(c, ac({ kind: "narrowbody" }))).toBe(false);
    expect(matchesRule(c, ac({ altFt: 6000 }))).toBe(false);
    expect(matchesRule(c, ac({ lat: 45 }))).toBe(false);
  });

  it("handles callsign, squawk, military, altitude bounds and ground state", () => {
    expect(matchesRule({ callsignPrefix: "UAL" }, ac())).toBe(true);
    expect(matchesRule({ callsignPrefix: "DAL" }, ac())).toBe(false);
    expect(matchesRule({ callsignPrefix: "UAL" }, ac({ callsign: null }))).toBe(false);
    expect(matchesRule({ squawk: "7700" }, ac({ squawk: "7700" }))).toBe(true);
    expect(matchesRule({ squawk: "7700" }, ac())).toBe(false);
    expect(matchesRule({ military: true }, ac({ military: true }))).toBe(true);
    expect(matchesRule({ military: true }, ac())).toBe(false);
    expect(matchesRule({ altMinFt: 3000, altMaxFt: 5000 }, ac())).toBe(true);
    expect(matchesRule({ altMinFt: 5000 }, ac())).toBe(false);
    expect(matchesRule({ altMaxFt: 5000 }, ac({ altFt: null }))).toBe(false);
    // On the ground counts as 0 ft.
    expect(matchesRule({ altMaxFt: 500 }, ac({ onGround: true, altFt: null }))).toBe(true);
    expect(matchesRule({ airborne: true }, ac({ onGround: true }))).toBe(false);
    expect(matchesRule({ airborne: false }, ac({ onGround: true }))).toBe(true);
  });

  it("ignores aircraft with an old position", () => {
    expect(matchesRule({ military: true }, ac({ military: true, seenPos: 90 }))).toBe(false);
  });

  it("counts matches", () => {
    expect(
      countMatches({ kinds: ["widebody"] }, [
        ac(),
        ac({ hex: "2", kind: "light" }),
        ac({ hex: "3" }),
      ]),
    ).toBe(2);
  });
});

describe("evaluating rules over updates", () => {
  const rule: AlertRule = {
    id: "r1",
    name: "Heavies low",
    enabled: true,
    createdAt: 0,
    conditions: { kinds: ["widebody"], altMaxFt: 5000 },
  };
  const high = ac({ altFt: 30000 });
  const low = ac({ altFt: 4000 });

  function run(updates: RuleAircraft[][], rules: AlertRule[] = [rule], step = 7000): string[] {
    let state: RuleState = newRuleState();
    const out: string[] = [];
    updates.forEach((u, i) => {
      const r = evaluateRules(state, rules, u, 1_000_000 + i * step);
      state = r.state;
      for (const e of r.events) out.push(e.title);
    });
    return out;
  }

  it("learns the aircraft that already match and only alerts for new ones", () => {
    expect(run([[low]])).toEqual([]);
    expect(run([[high], [low]])).toEqual(["Heavies low: UAL123"]);
    expect(run([[high], [low], [low]])).toEqual(["Heavies low: UAL123"]);
  });

  it("alerts again after the cooldown when the aircraft re-enters", () => {
    let state = newRuleState();
    const t = (ms: number) => 1_000_000 + ms;
    state = evaluateRules(state, [rule], [high], t(0)).state;
    const first = evaluateRules(state, [rule], [low], t(7000));
    expect(first.events).toHaveLength(1);
    const out = evaluateRules(first.state, [rule], [high], t(14_000)).state;
    expect(evaluateRules(out, [rule], [low], t(21_000)).events).toHaveLength(0);
    const out2 = evaluateRules(out, [rule], [high], t(RULE_COOLDOWN_MS + 30_000)).state;
    expect(evaluateRules(out2, [rule], [low], t(RULE_COOLDOWN_MS + 37_000)).events).toHaveLength(1);
  });

  it("does not alert for a rule that is switched off, and starts fresh when switched on", () => {
    const off = { ...rule, enabled: false };
    expect(run([[high], [low]], [off])).toEqual([]);
    let state = newRuleState();
    state = evaluateRules(state, [off], [low], 1).state;
    const on = evaluateRules(state, [rule], [low], 7001);
    expect(on.events).toHaveLength(0);
  });

  it("limits messages per rule and summarises the rest", () => {
    const many = (alt: number) =>
      Array.from({ length: 8 }, (_, i) =>
        ac({ hex: "a0000" + i, callsign: "TST" + i, altFt: alt }),
      );
    const titles = run([many(30000), many(4000)]);
    expect(titles).toHaveLength(MAX_EVENTS_PER_RULE + 1);
    expect(titles[titles.length - 1]).toBe(
      "Heavies low: " + (8 - MAX_EVENTS_PER_RULE) + " more aircraft",
    );
  });

  it("does not change the state it is given", () => {
    const s0 = newRuleState();
    evaluateRules(s0, [rule], [low], 1);
    expect(s0.matching.size).toBe(0);
  });
});

describe("plain-English rules", () => {
  const places: Record<string, { lat: number; lon: number; label: string }> = {
    jfk: { lat: 40.6413, lon: -73.7781, label: "JFK" },
    "new york": { lat: 40.7, lon: -74, label: "New York" },
  };
  const resolve: PlaceResolver = (t) => places[t.trim().toLowerCase()] ?? null;

  it("reads altitudes", () => {
    expect(parseAltitudeFt("5000")).toBe(5000);
    expect(parseAltitudeFt("5,000")).toBe(5000);
    expect(parseAltitudeFt("5k")).toBe(5000);
    expect(parseAltitudeFt("FL350")).toBe(35000);
    expect(parseAltitudeFt("abc")).toBeNull();
    expect(parseAltitudeFt("fl")).toBeNull();
  });

  it("understands a typical sentence", () => {
    const p = parseRuleText(
      "Alert me when a heavy jet is below 5,000 ft within 40 nm of JFK",
      resolve,
    );
    expect(p.ok).toBe(true);
    expect(p.conditions).toMatchObject({ kinds: ["widebody"], altMaxFt: 5000 });
    expect(p.conditions.area).toMatchObject({ radiusNm: 40, label: "JFK" });
    expect(p.name).toBe("heavy jet, below 5,000 ft, within 40 nm of JFK");
    expect(p.ignored).toEqual([]);
  });

  it("understands military, callsigns, squawks and ground state", () => {
    expect(parseRuleText("any military aircraft", resolve).conditions.military).toBe(true);
    expect(parseRuleText("callsign starting with RCH", resolve).conditions.callsignPrefix).toBe(
      "RCH",
    );
    expect(parseRuleText("flight UAL", resolve).conditions.callsignPrefix).toBe("UAL");
    expect(parseRuleText("squawk 7500", resolve).conditions.squawk).toBe("7500");
    expect(parseRuleText("any emergency", resolve).conditions.squawk).toBe("7700");
    expect(parseRuleText("helicopters on the ground", resolve).conditions).toEqual({
      kinds: ["helicopter"],
      airborne: false,
    });
    expect(parseRuleText("a business jet", resolve).conditions.kinds).toEqual(["bizjet"]);
    expect(parseRuleText("small planes near JFK", resolve).conditions.kinds).toEqual(["light"]);
  });

  it("understands altitude ranges and units", () => {
    expect(parseRuleText("between 1k and 3k", resolve).conditions).toMatchObject({
      altMinFt: 1000,
      altMaxFt: 3000,
    });
    expect(parseRuleText("above FL300", resolve).conditions.altMinFt).toBe(30000);
    const miles = parseRuleText("military within 10 miles of new york", resolve);
    expect(miles.conditions.area?.radiusNm).toBeCloseTo(8.7, 1);
    const km = parseRuleText("military within 100 km of JFK", resolve);
    expect(km.conditions.area?.radiusNm).toBeCloseTo(54, 0);
  });

  it("uses a default radius for 'near'", () => {
    const p = parseRuleText("military near JFK", resolve);
    expect(p.conditions.area?.radiusNm).toBe(25);
    expect(p.understood.join(" ")).toContain("default radius");
  });

  it("reports places it cannot find and words it did not understand", () => {
    const p = parseRuleText("military within 30 nm of atlantis", resolve);
    expect(p.ok).toBe(false);
    expect(p.errors[0]).toContain("atlantis");
    const q = parseRuleText("military purple sparkly", resolve);
    expect(q.ok).toBe(true);
    expect(q.ignored).toEqual(["purple", "sparkly"]);
  });

  it("refuses text with nothing to look for and impossible ranges", () => {
    expect(parseRuleText("alert me please", resolve).ok).toBe(false);
    expect(parseRuleText("", resolve).errors).toHaveLength(1);
    const bad = parseRuleText("military within 9000 nm of JFK", resolve);
    expect(bad.ok).toBe(false);
  });
});
