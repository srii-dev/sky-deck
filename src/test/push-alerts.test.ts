import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { Aircraft } from "@/lib/aircraft";
import { isPushEligible, newRuleState, RULE_COOLDOWN_MS, type AlertRule } from "@/lib/alert-rules";
import {
  circleFor,
  evaluatePushRules,
  MAX_PUSH_CIRCLES,
  MAX_PUSH_PER_USER,
  MAX_PUSH_SENDS,
  messagesByUser,
  planPushCheck,
  restoreCooldowns,
  runPushCheck,
  serializeCooldowns,
  type PushCheckDeps,
  type PushMessage,
  type PushRuleRow,
  type PushSubscriptionRow,
} from "@/lib/push-alerts";
import { pushRuleRows } from "@/lib/push-client";
import { deletePushSubscription, loadPushData } from "@/lib/push-store.server";
import { distanceNm } from "@/lib/route-geometry";

/* Closed-page alerts (Phase 10f): planning, matching, message building and one full check with fakes. */

function key() {
  const k = createECDH("prime256v1");
  k.generateKeys();
  return k.getPublicKey().toString("base64url");
}

function sub(user: string, n = 1): PushSubscriptionRow {
  return {
    user_id: user,
    endpoint: `https://push.example.net/${user}/${n}`,
    p256dh: key(),
    auth: Buffer.from("0123456789abcdef").toString("base64url"),
  };
}

const JFK = { lat: 40.64, lon: -73.78, radiusNm: 40, label: "JFK" };

function rule(
  user: string,
  id: string,
  conditions: unknown = { kinds: ["widebody"], area: JFK },
): PushRuleRow {
  return { user_id: user, rule_id: id, name: "Heavies at JFK", conditions };
}

function plane(p: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: "abc123",
    callsign: "UAL123",
    registration: "N123UA",
    type: "B77W",
    description: null,
    operator: null,
    lat: 40.7,
    lon: -73.8,
    altFt: 4000,
    onGround: false,
    gs: 200,
    track: 90,
    vRate: 0,
    squawk: "1200",
    category: "A5",
    kind: "widebody",
    kindLabel: "Heavy jet",
    seenPos: 1,
    ...p,
  };
}

describe("which rules can be checked while the page is closed", () => {
  it("needs an area no wider than the feed's largest circle", () => {
    expect(isPushEligible({ kinds: ["widebody"], area: JFK })).toBe(true);
    expect(isPushEligible({ kinds: ["widebody"] })).toBe(false);
    expect(isPushEligible({ area: { ...JFK, radiusNm: 300 } })).toBe(false);
  });

  it("keeps only eligible rules when the page saves them to the account", () => {
    const rules: AlertRule[] = [
      { id: "a", name: "A", enabled: true, createdAt: 1, conditions: { area: JFK } },
      { id: "b", name: "B", enabled: false, createdAt: 1, conditions: { military: true } },
    ];
    expect(pushRuleRows(rules)).toEqual([
      { rule_id: "a", name: "A", conditions: { area: JFK }, enabled: true },
    ]);
  });
});

describe("planning a check", () => {
  it("covers each area with a snapped feed circle", () => {
    for (const area of [
      JFK,
      { lat: 51.47, lon: -0.45, radiusNm: 7 },
      { lat: -33.9, lon: 151.2, radiusNm: 249 },
    ]) {
      const c = circleFor(area);
      // Every point of the area lies inside the circle.
      expect(distanceNm(c, area) + area.radiusNm).toBeLessThanOrEqual(c.radiusNm);
    }
  });

  it("checks only rules of users with a browser, shares circles, and cleans the stored conditions", () => {
    const plan = planPushCheck(
      [
        rule("u1", "r1"),
        rule("u2", "r1"),
        rule("u3", "r1"),
        rule("u1", "r2", { military: true }),
        rule("u1", "r3", { area: JFK, kinds: ["spaceship"] }),
        rule("u1", "r4", "not an object"),
      ],
      [sub("u1"), sub("u2"), { ...sub("u4"), endpoint: "http://insecure.example/" }],
    );
    expect(plan.rules.map((r) => r.rule.id)).toEqual(["u1:r1", "u2:r1", "u1:r3"]);
    expect(plan.rules[2]!.rule.conditions.kinds).toBeUndefined();
    expect(plan.circles).toHaveLength(1);
    expect([...plan.subscriptions.keys()]).toEqual(["u1", "u2"]);
  });

  it("caps the number of circles one check loads", () => {
    const n = MAX_PUSH_CIRCLES + 5;
    const rows = Array.from({ length: n }, (_, i) =>
      rule("u" + i, "r1", { area: { lat: 10 + i, lon: 10, radiusNm: 20, label: "x" } }),
    );
    const plan = planPushCheck(
      rows,
      rows.map((r) => sub(r.user_id)),
    );
    expect(plan.circles).toHaveLength(MAX_PUSH_CIRCLES);
    expect(plan.skipped).toBe(5);
  });
});

describe("matching", () => {
  const plan = planPushCheck([rule("u1", "r1")], [sub("u1")]);
  const key0 = plan.circles[0]!.key;

  it("learns on the first check, then alerts for aircraft that start matching", () => {
    let state = newRuleState();
    const first = evaluatePushRules(state, plan, new Map([[key0, [plane()]]]), 1000);
    expect(first.events).toHaveLength(0);
    state = first.state;
    const second = evaluatePushRules(
      state,
      plan,
      new Map([[key0, [plane(), plane({ hex: "def456", callsign: "BAW1" })]]]),
      2000,
    );
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ userId: "u1", hex: "def456", lat: 40.7, lon: -73.8 });
  });

  it("keeps the previous matches when a circle failed to load, so nothing alerts twice", () => {
    const a = evaluatePushRules(newRuleState(), plan, new Map([[key0, [plane()]]]), 1000);
    const b = evaluatePushRules(a.state, plan, new Map(), 2000);
    const c = evaluatePushRules(b.state, plan, new Map([[key0, [plane()]]]), 3000);
    expect(c.events).toHaveLength(0);
  });

  it("saves and restores only the cooldowns", () => {
    const state = {
      matching: new Map([["x", new Set(["a"])]]),
      lastAlert: new Map([["u1:r1:abc123", 5]]),
    };
    const back = restoreCooldowns(JSON.parse(JSON.stringify(serializeCooldowns(state))));
    expect(back.matching.size).toBe(0);
    expect([...back.lastAlert]).toEqual([["u1:r1:abc123", 5]]);
    expect(restoreCooldowns("junk").lastAlert.size).toBe(0);
  });
});

describe("messages", () => {
  it("sends at most a few per user and folds the rest into the last one, with a same-site link", () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      ruleId: "u1:r1",
      hex: "abc12" + i,
      title: "Heavies at JFK: UAL" + i,
      detail: "B77W, 4,000 ft",
      userId: "u1",
      lat: 40.7,
      lon: -73.8,
    }));
    const msgs = messagesByUser(events).get("u1")!;
    expect(msgs).toHaveLength(MAX_PUSH_PER_USER);
    expect(msgs[0]).toEqual({
      title: "Heavies at JFK: UAL0",
      body: "B77W, 4,000 ft",
      tag: "rule-r1-abc120",
      url: "/?lat=40.7000&lon=-73.8000&z=9&hex=abc120",
    });
    expect(msgs[2]!.body).toMatch(/And 2 more alerts\.$/);
  });
});

describe("one check", () => {
  function deps(over: Partial<PushCheckDeps> & { aircraft?: Aircraft[] } = {}) {
    const sent: { endpoint: string; message: PushMessage }[] = [];
    const deleted: string[] = [];
    let now = 0;
    const d: PushCheckDeps = {
      loadData: async () => ({ subs: [sub("u1"), sub("u1", 2)], rules: [rule("u1", "r1")] }),
      loadFeed: async () => ({ aircraft: over.aircraft ?? [] }),
      send: async (s, message) => {
        sent.push({ endpoint: s.endpoint, message });
        return 201;
      },
      deleteSubscription: async (_u, endpoint) => void deleted.push(endpoint),
      now: () => (now += 1000),
      ...over,
    };
    return { d, sent, deleted };
  }

  it("sends a new match to every browser of the user, once", async () => {
    const quiet = deps({ aircraft: [] });
    const first = await runPushCheck(newRuleState(), quiet.d);
    expect(first.report).toMatchObject({ rules: 1, circles: 1, sent: 0 });
    const busy = deps({ aircraft: [plane()] });
    const second = await runPushCheck(first.state, busy.d);
    expect(second.report).toMatchObject({ events: 1, sent: 2, failed: 0 });
    expect(busy.sent.map((s) => s.endpoint)).toEqual([
      "https://push.example.net/u1/1",
      "https://push.example.net/u1/2",
    ]);
    // Same aircraft next time: no new alert.
    const third = await runPushCheck(second.state, deps({ aircraft: [plane()] }).d);
    expect(third.report.sent).toBe(0);
  });

  it("deletes a browser the push service says is gone", async () => {
    const first = await runPushCheck(newRuleState(), deps().d);
    const gone = deps({
      aircraft: [plane()],
      send: async (s) => (s.endpoint.endsWith("/1") ? 410 : 201),
    });
    const r = await runPushCheck(first.state, gone.d);
    expect(r.report).toMatchObject({ sent: 1, failed: 1, removed: 1 });
    expect(gone.deleted).toEqual(["https://push.example.net/u1/1"]);
  });

  it("never sends more than the per-check limit", async () => {
    const users = Array.from({ length: 30 }, (_, i) => "u" + i);
    const loadData = async () => ({
      subs: users.map((u) => sub(u)),
      rules: users.map((u) => rule(u, "r1")),
    });
    const first = await runPushCheck(newRuleState(), deps({ loadData }).d);
    const many = deps({ loadData, aircraft: [plane()] });
    const r = await runPushCheck(first.state, many.d);
    expect(r.report.events).toBe(30);
    expect(many.sent).toHaveLength(MAX_PUSH_SENDS);
  });

  it("does nothing without rules, and treats a failed feed as not loaded", async () => {
    const empty = await runPushCheck(
      newRuleState(),
      deps({ loadData: async () => ({ subs: [], rules: [] }) }).d,
    );
    expect(empty.report.rules).toBe(0);
    const failed = await runPushCheck(
      newRuleState(),
      deps({ loadFeed: async () => ({ aircraft: [], error: "busy" }) }).d,
    );
    expect(failed.report.circlesFailed).toBe(1);
  });

  it("respects the cooldown when an aircraft leaves and comes back", async () => {
    let state = (await runPushCheck(newRuleState(), deps().d)).state;
    state = (await runPushCheck(state, deps({ aircraft: [plane()] }).d)).state;
    state = (await runPushCheck(state, deps({ aircraft: [] }).d)).state;
    const back = deps({ aircraft: [plane()] });
    await runPushCheck(state, back.d);
    expect(back.sent).toHaveLength(0);
    expect(RULE_COOLDOWN_MS).toBeGreaterThan(10_000);
  });
});

describe("push store (Supabase REST)", () => {
  it("reads with the service key and skips rules when nobody subscribed", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    const out = await loadPushData({ url: "https://x.supabase.co/", serviceKey: "svc" }, f);
    expect(out).toEqual({ subs: [], rules: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/^https:\/\/x\.supabase\.co\/rest\/v1\/push_subscriptions\?/);
    expect((calls[0]!.init!.headers as Record<string, string>)["apikey"]).toBe("svc");
  });

  it("deletes one subscription by user and endpoint, and reports failures", async () => {
    let seen = "";
    const ok = (async (url: string) => {
      seen = url;
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await deletePushSubscription(
      { url: "https://x.supabase.co", serviceKey: "svc" },
      "u1",
      "https://p.example/a?b=c",
      ok,
    );
    const q = new URL(seen).searchParams;
    expect(q.get("user_id")).toBe("eq.u1");
    expect(q.get("endpoint")).toBe("eq.https://p.example/a?b=c");
    const bad = (async () => new Response(null, { status: 500 })) as typeof fetch;
    await expect(
      deletePushSubscription({ url: "https://x.supabase.co", serviceKey: "svc" }, "u1", "e", bad),
    ).rejects.toThrow();
  });
});

describe("web push migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20261125000000_web_push.sql"),
    "utf8",
  ).toLowerCase();

  it("limits each table to the user's own rows for every action", () => {
    for (const table of ["push_subscriptions", "push_rules"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      for (const action of ["select", "insert", "update", "delete"]) {
        expect(sql).toMatch(new RegExp(`on public\\.${table}\\s+for ${action}`));
      }
      expect(sql).toMatch(new RegExp(`create table public\\.${table} \\([^;]*on delete cascade`));
    }
    expect(sql).toContain("< 5");
    expect(sql).toContain("< 20");
    expect(sql).not.toContain("security definer");
  });
});
