import { describe, expect, it } from "vitest";
import {
  currentStage,
  inferStage,
  isNotableChange,
  MAX_STAGE_CHANGES,
  recordStage,
  sanitizeTracks,
  sinceText,
  stageStep,
  STAGE_LABELS,
  STEP_NAMES,
  type FlightStage,
  type StageInput,
  type StageRoute,
} from "@/lib/flight-stage";
import { intermediatePoint } from "@/lib/route-geometry";

const JFK = { lat: 40.6413, lon: -73.7781 };
const LAX = { lat: 33.9416, lon: -118.4085 };
const ROUTE: StageRoute = { origin: JFK, destination: LAX };

function input(p: Partial<StageInput> = {}): StageInput {
  return { onGround: false, gs: 450, altFt: 35000, vRate: 0, lat: 39, lon: -95, ...p };
}

function stage(
  p: Partial<StageInput>,
  route: StageRoute | null = ROUTE,
  prev: FlightStage | null = null,
) {
  return inferStage(input(p), route, prev).stage;
}

describe("stage on the ground", () => {
  const atJfk = { lat: JFK.lat, lon: JFK.lon, onGround: true, altFt: 0 };
  const atLax = { lat: LAX.lat, lon: LAX.lon, onGround: true, altFt: 0 };

  it("is at the gate, taxiing out or taking off near the origin", () => {
    expect(stage({ ...atJfk, gs: 0 })).toBe("gate-out");
    expect(stage({ ...atJfk, gs: 15 })).toBe("taxi-out");
    expect(stage({ ...atJfk, gs: 90 })).toBe("takeoff");
  });

  it("is landing, taxiing in or at the gate near the destination", () => {
    expect(stage({ ...atLax, gs: 100 }, ROUTE, "approach")).toBe("landing");
    expect(stage({ ...atLax, gs: 15 })).toBe("taxi-in");
    expect(stage({ ...atLax, gs: 0 })).toBe("gate-in");
  });

  it("uses the previous stage when the route is unknown", () => {
    expect(stage({ onGround: true, gs: 100 }, null, "approach")).toBe("landing");
    expect(stage({ onGround: true, gs: 10 }, null, "landing")).toBe("taxi-in");
    expect(stage({ onGround: true, gs: 0 }, null, "taxi-in")).toBe("gate-in");
    expect(stage({ onGround: true, gs: 10 }, null, null)).toBe("taxi-out");
    expect(stage({ onGround: true, gs: 80 }, null, "taxi-out")).toBe("takeoff");
  });

  it("treats a missing ground speed as stopped", () => {
    expect(stage({ ...atJfk, gs: null })).toBe("gate-out");
  });
});

describe("stage in the air", () => {
  it("is takeoff just after leaving the origin, then climb", () => {
    expect(stage({ lat: JFK.lat + 0.02, lon: JFK.lon, altFt: 900, vRate: 2500, gs: 160 })).toBe(
      "takeoff",
    );
    expect(stage({ lat: 40.9, lon: -74.5, altFt: 12000, vRate: 2000 })).toBe("climb");
  });

  it("is cruise when high and level, also without a route", () => {
    expect(stage({ altFt: 36000, vRate: 50 })).toBe("cruise");
    expect(stage({ altFt: 36000, vRate: 50 }, null)).toBe("cruise");
    expect(stage({ altFt: 12000, vRate: 0 }, null)).toBe("cruise");
  });

  it("is descent, then approach near the destination", () => {
    expect(stage({ altFt: 24000, vRate: -2000 })).toBe("descent");
    const near = intermediatePoint(JFK, LAX, 0.985);
    expect(stage({ lat: near.lat, lon: near.lon, altFt: 8000, vRate: -1500 })).toBe("approach");
    expect(stage({ lat: near.lat, lon: near.lon, altFt: 5000, vRate: 0 })).toBe("approach");
  });

  it("calls low descent without a route an approach only after a descent", () => {
    expect(stage({ altFt: 2000, vRate: -700 }, null, "descent")).toBe("approach");
    expect(stage({ altFt: 24000, vRate: -2000 }, null, null)).toBe("descent");
  });

  it("keeps the previous stage in a level-off and defaults to climb when low and unknown", () => {
    expect(stage({ altFt: 8000, vRate: 0 }, null, "climb")).toBe("climb");
    expect(stage({ altFt: 9000, vRate: 0 }, ROUTE, "descent")).toBe("descent");
    expect(stage({ altFt: 4000, vRate: 0 }, null, null)).toBe("climb");
  });
});

describe("remaining distance and ETA", () => {
  it("gives them in the air with a route", () => {
    const r = inferStage(input({ lat: 39.5, lon: -98, gs: 450 }), ROUTE, null);
    expect(r.remainingNm).toBeGreaterThan(1000);
    expect(r.etaMin).toBeGreaterThan(100);
    expect(r.step).toBe(3);
    expect(r.label).toBe("Cruising");
  });

  it("gives none on the ground, without a route or when slow", () => {
    expect(
      inferStage(input({ onGround: true, gs: 0, lat: JFK.lat, lon: JFK.lon }), ROUTE, null)
        .remainingNm,
    ).toBeNull();
    expect(inferStage(input(), null, null).etaMin).toBeNull();
    expect(inferStage(input({ gs: 60 }), ROUTE, null).etaMin).toBeNull();
  });
});

describe("route that does not fit", () => {
  it("ignores a route when the aircraft is far from the line, in the air or on the ground", () => {
    // Over New York on a flight listed as Los Angeles to Sacramento.
    const rt: StageRoute = { origin: LAX, destination: { lat: 38.7, lon: -121.6 } };
    const air = inferStage(
      input({ lat: 40.7, lon: -74, altFt: 1100, vRate: -700, gs: 160 }),
      rt,
      null,
    );
    expect(air.routeMismatch).toBe(true);
    expect(air.remainingNm).toBeNull();
    expect(air.etaMin).toBeNull();
    expect(air.stage).toBe("approach");
    const gnd = inferStage(
      input({ lat: 40.7, lon: -74, onGround: true, gs: 0, altFt: 0 }),
      rt,
      null,
    );
    expect(gnd.routeMismatch).toBe(true);
    expect(gnd.stage).toBe("gate-out");
  });

  it("does not call a low descent far from the destination an approach", () => {
    const far = inferStage(
      input({ lat: 41.5, lon: -80, altFt: 2000, vRate: -800, gs: 200 }),
      ROUTE,
      "cruise",
    );
    expect(far.stage).toBe("descent");
  });

  it("keeps a route that fits", () => {
    expect(inferStage(input({ lat: 39.5, lon: -98 }), ROUTE, null).routeMismatch).toBe(false);
    expect(inferStage(input({ lat: 39.5, lon: -98 }), null, null).routeMismatch).toBe(false);
  });
});

describe("stage steps and labels", () => {
  it("maps every stage to one of the seven steps", () => {
    for (const s of Object.keys(STAGE_LABELS) as FlightStage[]) {
      expect(stageStep(s)).toBeGreaterThanOrEqual(0);
      expect(stageStep(s)).toBeLessThan(STEP_NAMES.length);
    }
    expect(stageStep("cruise")).toBe(3);
    expect(stageStep("landing")).toBe(stageStep("approach"));
    expect(stageStep("gate-in")).toBe(6);
  });
});

describe("history of stages", () => {
  it("records a stage only when it changes, and caps the list", () => {
    let t = recordStage(undefined, "climb", 1000);
    expect(recordStage(t, "climb", 2000)).toBe(t);
    t = recordStage(t, "cruise", 3000);
    expect(t.changes.map((c) => c.stage)).toEqual(["climb", "cruise"]);
    expect(currentStage(t)).toBe("cruise");
    for (let i = 0; i < 50; i++) t = recordStage(t, i % 2 ? "descent" : "cruise", 4000 + i);
    expect(t.changes.length).toBeLessThanOrEqual(MAX_STAGE_CHANGES);
    expect(currentStage(undefined)).toBeNull();
  });

  it("picks the changes worth a message", () => {
    expect(isNotableChange("climb", "cruise")).toBe(true);
    expect(isNotableChange("cruise", "descent")).toBe(true);
    expect(isNotableChange(null, "cruise")).toBe(false);
    expect(isNotableChange("cruise", "cruise")).toBe(false);
    expect(isNotableChange("taxi-out", "takeoff")).toBe(false);
  });

  it("says how long ago", () => {
    expect(sinceText(0, 20_000)).toBe("just now");
    expect(sinceText(0, 12 * 60_000)).toBe("12 min ago");
    expect(sinceText(0, 135 * 60_000)).toBe("2 h 15 min ago");
    expect(sinceText(0, 120 * 60_000)).toBe("2 h ago");
  });

  it("cleans stored tracks", () => {
    const out = sanitizeTracks({
      UAL123: {
        changes: [
          { stage: "climb", at: 5 },
          { stage: "bogus", at: 6 },
          { stage: "cruise", at: "x" },
        ],
      },
      "bad key!": { changes: [{ stage: "climb", at: 1 }] },
      EMPTY1: { changes: [] },
      NOCHG: {},
    });
    expect(Object.keys(out)).toEqual(["UAL123"]);
    expect(out["UAL123"]?.changes).toEqual([{ stage: "climb", at: 5 }]);
    expect(sanitizeTracks(null)).toEqual({});
    expect(sanitizeTracks([])).toEqual({});
  });
});
