import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENTS,
  challengesForDay,
  CHALLENGES,
  CHALLENGES_PER_DAY,
  dayKey,
  emptyCollection,
  MAX_TYPES,
  normalizeReg,
  normalizeType,
  recordSelection,
  sanitizeCollection,
  type Collection,
  type SelectedAircraft,
} from "@/lib/collection";

const DAY = "2026-11-09";
const ac = (
  type: string | null,
  registration: string | null,
  kind: SelectedAircraft["kind"] = "narrowbody",
  military = false,
): SelectedAircraft => ({ type, registration, kind, military });

function run(c: Collection, list: SelectedAircraft[], day = DAY) {
  let cur = c;
  const unlocked: string[] = [];
  const completed: string[] = [];
  list.forEach((a, i) => {
    const r = recordSelection(cur, a, 1000 + i, day);
    cur = r.next;
    unlocked.push(...r.unlocked.map((x) => x.id));
    completed.push(...r.completed.map((x) => x.id));
  });
  return { c: cur, unlocked, completed };
}

describe("recording", () => {
  it("remembers a new type and registration, and counts repeats", () => {
    const a = recordSelection(emptyCollection(DAY), ac("b738", "n123ab"), 5, DAY);
    expect(a.newType).toBe("B738");
    expect(a.newReg).toBe("N123AB");
    expect(a.next.types["B738"]).toMatchObject({ first: 5, count: 1, shape: "narrowbody" });
    const b = recordSelection(a.next, ac("B738", "N999ZZ"), 9, DAY);
    expect(b.newType).toBeNull();
    expect(b.newReg).toBe("N999ZZ");
    expect(b.next.types["B738"]?.count).toBe(2);
    expect(Object.keys(b.next.regs)).toHaveLength(2);
  });

  it("ignores aircraft with neither a usable type nor registration", () => {
    const c = emptyCollection(DAY);
    expect(recordSelection(c, ac(null, null), 1, DAY).next).toBe(c);
    expect(recordSelection(c, ac("", "  "), 1, DAY).next).toBe(c);
    expect(recordSelection(c, ac("TOOLONG", "!!"), 1, DAY).next).toBe(c);
  });

  it("stores the icon shape, so a 747 is a four-engine heavy", () => {
    const r = recordSelection(emptyCollection(DAY), ac("B744", "G-VXLG", "widebody"), 1, DAY);
    expect(r.next.types["B744"]?.shape).toBe("quad");
  });

  it("stops adding new types at the limit but still counts known ones", () => {
    const c = emptyCollection(DAY);
    for (let i = 0; i < MAX_TYPES; i++) {
      c.types["T" + String(i).padStart(3, "0")] = { first: 0, count: 1, shape: "light" };
    }
    const r = recordSelection(c, ac("ZZZZ", "N1"), 1, DAY);
    expect(r.newType).toBeNull();
    expect(Object.keys(r.next.types)).toHaveLength(MAX_TYPES);
    const again = recordSelection(c, ac("T001", null), 1, DAY);
    expect(again.next.types["T001"]?.count).toBe(2);
  });

  it("normalises codes", () => {
    expect(normalizeType(" a320 ")).toBe("A320");
    expect(normalizeType("A")).toBeNull();
    expect(normalizeReg("g-ezag")).toBe("G-EZAG");
    expect(normalizeReg("-x")).toBeNull();
  });
});

describe("achievements", () => {
  it("unlocks each once, at the moment it is reached", () => {
    const list = ["B738", "A320", "E190", "C172", "DH8D"].map((t, i) =>
      ac(t, "N" + i + "A", t === "C172" ? "light" : "narrowbody"),
    );
    const r = run(emptyCollection(DAY), list);
    expect(r.unlocked).toContain("types-5");
    expect(r.unlocked.filter((x) => x === "types-5")).toHaveLength(1);
    // Opening more does not unlock it again.
    expect(run(r.c, [ac("B739", "N77")]).unlocked).not.toContain("types-5");
  });

  it("recognises helicopters, gliders, heavies, military and four-engine heavies", () => {
    const r = run(emptyCollection(DAY), [
      ac("R44", "N44", "helicopter"),
      ac("ASK2", "D-1", "glider"),
      ac("B77W", "A6-ABC", "widebody"),
      ac("A388", "A6-EDA", "widebody"),
      ac("C17", "07-7170", "widebody", true),
    ]);
    for (const id of ["rotor", "soar", "heavy", "quad", "military"])
      expect(r.unlocked).toContain(id);
    expect(r.unlocked).not.toContain("props");
  });

  it("measures progress for the bar and never above the need", () => {
    const c = run(emptyCollection(DAY), [ac("B738", "N1"), ac("A320", "N2")]).c;
    const a = ACHIEVEMENTS.find((x) => x.id === "types-25")!;
    expect(a.progress(c)).toEqual({ have: 2, need: 25 });
  });

  it("has unique ids", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe("daily challenges", () => {
  it("gives the same challenges on the same day and rotates through the list", () => {
    expect(challengesForDay(DAY).map((c) => c.id)).toEqual(challengesForDay(DAY).map((c) => c.id));
    expect(challengesForDay(DAY)).toHaveLength(CHALLENGES_PER_DAY);
    const seen = new Set<string>();
    for (let d = 1; d <= 8; d++) {
      for (const c of challengesForDay("2026-11-" + String(d).padStart(2, "0"))) seen.add(c.id);
    }
    expect(seen.size).toBe(CHALLENGES.length);
    expect(new Set(challengesForDay(DAY).map((c) => c.id)).size).toBe(CHALLENGES_PER_DAY);
  });

  it("completes the helicopter, glider and heavy jet challenge", () => {
    const ch = CHALLENGES.find((c) => c.id === "c-rotor-glider-heavy")!;
    expect(ch.progress(emptyCollection(DAY).daily)).toEqual({ have: 0, need: 3 });
    const c = run(emptyCollection(DAY), [
      ac("R44", "N44", "helicopter"),
      ac("ASK2", "D-1", "glider"),
    ]).c;
    expect(ch.progress(c.daily)).toEqual({ have: 2, need: 3 });
    const d = run(c, [ac("B77W", "A6-ABC", "widebody")]).c.daily;
    expect(ch.progress(d)).toEqual({ have: 3, need: 3 });
  });

  it("marks today's challenges done once and counts them", () => {
    const todays = challengesForDay(DAY);
    // Open enough of everything that every challenge is met.
    const list = [
      ac("R44", "N1", "helicopter"),
      ac("ASK2", "N2", "glider"),
      ac("B744", "N3", "widebody"),
      ac("B77W", "N4", "widebody"),
      ac("AT76", "N5", "light"),
      ac("CRJ9", "N6", "narrowbody"),
      ac("C172", "N7", "light"),
      ac("C56X", "N8", "bizjet"),
      ac("B738", "N9", "narrowbody"),
      ac("A320", "N10", "narrowbody"),
    ];
    const r = run(emptyCollection(DAY), list);
    expect([...r.completed].sort()).toEqual(todays.map((c) => c.id).sort());
    expect(r.c.challengesDone).toBe(todays.length);
    // Reopening does not complete them again.
    expect(run(r.c, [ac("B738", "N11")]).completed).toEqual([]);
  });

  it("starts a new day from nothing but keeps the collection", () => {
    const r = run(emptyCollection(DAY), [ac("B738", "N1")]);
    const next = recordSelection(r.c, ac("A320", "N2"), 9, "2026-11-10").next;
    expect(next.daily).toMatchObject({ day: "2026-11-10", count: 1, types: ["A320"] });
    expect(Object.keys(next.types)).toHaveLength(2);
  });

  it("formats the local date", () => {
    expect(dayKey(new Date(2026, 10, 9, 15).getTime())).toBe("2026-11-09");
  });
});

describe("sanitizeCollection", () => {
  it("round-trips real data", () => {
    const c = run(emptyCollection(DAY), [
      ac("B744", "G-VXLG", "widebody"),
      ac("R44", "N44", "helicopter"),
    ]).c;
    expect(sanitizeCollection(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("drops garbage and unknown ids without throwing", () => {
    expect(sanitizeCollection(null)).toEqual(emptyCollection());
    expect(sanitizeCollection("x")).toEqual(emptyCollection());
    const c = sanitizeCollection({
      types: { B738: { first: "x", count: -3, shape: "banana" }, "bad code": {}, A320: 5 },
      regs: { N1: { count: 2, type: "<script>" }, "!!": {} },
      kinds: { light: 3, nope: 4, glider: -1 },
      military: -1,
      unlocked: { "types-5": 7, hack: 9 },
      daily: { day: "yesterday", shapes: ["quad"] },
      challengesDone: "many",
    });
    expect(Object.keys(c.types)).toEqual(["B738"]);
    expect(c.types["B738"]).toEqual({ first: 0, count: 1, shape: "generic" });
    expect(c.regs["N1"]).toEqual({ first: 0, count: 2, type: null });
    expect(c.kinds).toEqual({ light: 3 });
    expect(c.military).toBe(0);
    expect(c.unlocked).toEqual({ "types-5": 7 });
    expect(c.daily.day).toBe("");
    expect(c.challengesDone).toBe(0);
  });
});
