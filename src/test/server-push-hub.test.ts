import { createECDH } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PushHub } from "@/server/push-hub";
import { fakeCtx, type FakeCtx } from "./server-do-fake";

/* The closed-page alert check as the PushHub runs it: real planning, matching and encryption; the database, the
 * push service and the FeedHub are fakes. */

function keyPair() {
  const k = createECDH("prime256v1");
  k.generateKeys();
  const secret = Buffer.alloc(32);
  k.getPrivateKey().copy(secret, 32 - k.getPrivateKey().length);
  return { publicKey: k.getPublicKey("base64url"), privateKey: secret.toString("base64url") };
}

const vapid = keyPair();
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/u1/1";
const subscription = {
  user_id: "u1",
  endpoint: ENDPOINT,
  p256dh: keyPair().publicKey,
  auth: Buffer.from("0123456789abcdef").toString("base64url"),
};
const rule = {
  user_id: "u1",
  rule_id: "r1",
  name: "Heavies at JFK",
  conditions: {
    kinds: ["widebody"],
    area: { lat: 40.64, lon: -73.78, radiusNm: 40, label: "JFK" },
  },
};
const plane = {
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
};

let planes: (typeof plane)[] = [];
let pushStatus = 201;
let databaseDown = false;
let calls: { url: string; init: RequestInit }[] = [];
const load = vi.fn(async () => ({ aircraft: planes, source: "adsb.lol", fetchedAt: Date.now() }));

const env = (over: Record<string, unknown> = {}) => ({
  SUPABASE_URL: "https://db.example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: "mailto:ops@example.com",
  FEED_HUB: { idFromName: (n: string) => n, get: () => ({ load }) },
  ...over,
});

async function hub(ctx: FakeCtx = fakeCtx(), over: Record<string, unknown> = {}) {
  const h = new PushHub(ctx as never, env(over));
  await ctx.ready;
  return h;
}

const pushes = () => calls.filter((c) => c.url === ENDPOINT);

beforeEach(() => {
  planes = [];
  pushStatus = 201;
  databaseDown = false;
  calls = [];
  load.mockClear();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (url === ENDPOINT) return new Response(null, { status: pushStatus });
    if (databaseDown) return new Response("no", { status: 503 });
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json(url.includes("/push_rules?") ? [rule] : [subscription]);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PushHub", () => {
  it.each([
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "FEED_HUB",
  ])("does nothing without %s", async (name) => {
    const ctx = fakeCtx();
    expect(await (await hub(ctx, { [name]: "" })).check()).toBe("not-configured");
    expect(calls).toEqual([]);
    expect(ctx.writes).toEqual([]);
  });

  it("sends an encrypted push for a new match and saves what it needs to not repeat it", async () => {
    const ctx = fakeCtx();
    const h = await hub(ctx);
    expect(await h.check()).toMatchObject({ rules: 1, sent: 0 });
    planes = [plane];
    expect(await h.check()).toMatchObject({ events: 1, sent: 1, failed: 0 });

    const [push] = pushes();
    expect(push!.init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(push!.init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(push!.init.headers).get("authorization")).toMatch(/^vapid /);
    expect(Buffer.from(push!.init.body as Uint8Array).toString()).not.toContain("UAL123");
    expect([...ctx.data.keys()].sort()).toEqual(["cooldowns", "matching"]);
    expect(JSON.stringify(ctx.data.get("cooldowns"))).toContain("abc123");

    // The object is unloaded between cron runs: a new one with the same storage stays quiet.
    const again = await hub(fakeCtx(Object.fromEntries(ctx.data)));
    expect(await again.check()).toMatchObject({ sent: 0 });
    expect(pushes()).toHaveLength(1);
  });

  it("removes a browser the push service says is gone", async () => {
    const h = await hub();
    await h.check();
    planes = [plane];
    pushStatus = 410;
    expect(await h.check()).toMatchObject({ sent: 0, removed: 1 });
    const del = calls.find((c) => c.init.method === "DELETE")!;
    expect(new URL(del.url).searchParams.get("endpoint")).toBe("eq." + ENDPOINT);
  });

  it("answers busy while a check runs, so two cron runs never send twice", async () => {
    const h = await hub();
    const first = h.check();
    expect(await h.check()).toBe("busy");
    expect(await first).toMatchObject({ rules: 1 });
    expect(await h.check()).toMatchObject({ rules: 1 });
  });

  it("stays usable, and saves nothing, when the database is down", async () => {
    const ctx = fakeCtx();
    const h = await hub(ctx);
    databaseDown = true;
    await expect(h.check()).rejects.toThrow(/503/);
    expect(ctx.writes).toEqual([]);
    databaseDown = false;
    expect(await h.check()).toMatchObject({ rules: 1 });
  });
});
