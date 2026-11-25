import { afterEach, describe, expect, it } from "vitest";

import type { AlertRule } from "@/lib/alert-rules";
import {
  clearPushRules,
  currentSubscription,
  deleteSubscription,
  isFullError,
  isSubscriptionSaved,
  pushSupported,
  saveSubscription,
  subscribeBrowser,
  subscriptionKeys,
  syncPushRules,
  unsubscribeBrowser,
} from "@/lib/push-client";

import { fakeSub, fakeSupabase, installPush, type PushEnv } from "./hooks-ui-fakes";

/* The browser side of closed-page alerts (Phase 10f): every function returns a result and never throws. */

let env: PushEnv | null = null;
afterEach(() => {
  env?.restore();
  env = null;
});

const KEYS = { endpoint: "https://push.example/abc", p256dh: "P", auth: "A" };

describe("pushSupported", () => {
  it("is false in a browser without the push APIs (jsdom has none)", () => {
    expect("serviceWorker" in navigator).toBe(false);
    expect(pushSupported()).toBe(false);
  });

  it.each([
    ["service worker", { serviceWorker: false }],
    ["PushManager", { pushManager: false }],
    ["Notification", { notification: false }],
  ])("is false when %s is missing", (_name, parts) => {
    env = installPush(parts);
    expect(pushSupported()).toBe(false);
  });

  it("is true when all three are present", () => {
    env = installPush();
    expect(pushSupported()).toBe(true);
  });
});

describe("subscriptionKeys", () => {
  it("reads the endpoint and both keys", () => {
    expect(subscriptionKeys(fakeSub() as unknown as PushSubscription)).toEqual(KEYS);
  });

  it.each([
    ["no subscription", null],
    ["no auth key", fakeSub(undefined, { p256dh: "P" } as never)],
    ["no p256dh key", fakeSub(undefined, { auth: "A" } as never)],
    ["no endpoint", fakeSub("")],
  ])("is null with %s", (_name, sub) => {
    expect(subscriptionKeys(sub as unknown as PushSubscription | null)).toBeNull();
  });
});

describe("currentSubscription", () => {
  it("is null where push is not supported, without touching any API", async () => {
    env = installPush({ pushManager: false });
    expect(await currentSubscription()).toBeNull();
    expect(env.getRegistration).not.toHaveBeenCalled();
  });

  it("is null when the page has no service worker (dev server)", async () => {
    env = installPush();
    env.getRegistration.mockResolvedValue(undefined);
    expect(await currentSubscription()).toBeNull();
  });

  it("is null when reading the registration or the subscription throws", async () => {
    env = installPush();
    env.getRegistration.mockRejectedValueOnce(new Error("SecurityError"));
    expect(await currentSubscription()).toBeNull();
    env.getSubscription.mockRejectedValueOnce(new Error("boom"));
    expect(await currentSubscription()).toBeNull();
  });

  it("returns this browser's keys", async () => {
    env = installPush();
    env.getSubscription.mockResolvedValue(fakeSub());
    expect(await currentSubscription()).toEqual(KEYS);
  });
});

describe("subscribeBrowser", () => {
  it("reports unsupported browsers", async () => {
    env = installPush({ notification: false });
    expect(await subscribeBrowser("AQID")).toEqual({ ok: false, reason: "unsupported" });
  });

  it("reports a missing service worker before asking for permission", async () => {
    env = installPush();
    env.getRegistration.mockResolvedValue(undefined);
    expect(await subscribeBrowser("AQID")).toEqual({ ok: false, reason: "no-worker" });
    expect(env.requestPermission).not.toHaveBeenCalled();
  });

  it.each(["denied", "default"] as const)(
    "reports denied when permission comes back %s, and does not subscribe",
    async (answer) => {
      env = installPush();
      env.requestPermission.mockResolvedValue(answer);
      expect(await subscribeBrowser("AQID")).toEqual({ ok: false, reason: "denied" });
      expect(env.subscribe).not.toHaveBeenCalled();
    },
  );

  it("subscribes with userVisibleOnly and the VAPID key decoded from base64url", async () => {
    env = installPush();
    // 65 bytes like a real P-256 public key, chosen so the base64url form has "-" and "_" and needs padding.
    const raw = Uint8Array.from({ length: 65 }, (_, i) => (i * 37 + 251) % 256);
    const b64url = Buffer.from(raw).toString("base64url");
    expect(b64url).toMatch(/[-_]/);
    expect(b64url.length % 4).not.toBe(0);

    const r = await subscribeBrowser(b64url);
    expect(r).toEqual({ ok: true, keys: KEYS });
    expect(env.subscribe).toHaveBeenCalledTimes(1);
    const arg = env.subscribe.mock.calls[0]![0] as {
      userVisibleOnly: boolean;
      applicationServerKey: Uint8Array;
    };
    expect(arg.userVisibleOnly).toBe(true);
    expect(Array.from(arg.applicationServerKey)).toEqual(Array.from(raw));
  });

  it("reuses an existing subscription instead of subscribing again", async () => {
    env = installPush();
    env.getSubscription.mockResolvedValue(fakeSub("https://push.example/old"));
    const r = await subscribeBrowser("AQID");
    expect(r).toEqual({ ok: true, keys: { ...KEYS, endpoint: "https://push.example/old" } });
    expect(env.subscribe).not.toHaveBeenCalled();
  });

  it("fails when the push service refuses, the prompt throws, or the subscription has no keys", async () => {
    env = installPush();
    env.subscribe.mockRejectedValueOnce(new DOMException("AbortError"));
    expect(await subscribeBrowser("AQID")).toEqual({ ok: false, reason: "failed" });

    env.requestPermission.mockRejectedValueOnce(new Error("no gesture"));
    expect(await subscribeBrowser("AQID")).toEqual({ ok: false, reason: "failed" });

    env.subscribe.mockResolvedValueOnce(fakeSub(undefined, {} as never));
    expect(await subscribeBrowser("AQID")).toEqual({ ok: false, reason: "failed" });
  });

  it("fails on a VAPID key that is not base64", async () => {
    env = installPush();
    expect(await subscribeBrowser("not base64!!")).toEqual({ ok: false, reason: "failed" });
  });
});

describe("unsubscribeBrowser", () => {
  it("unsubscribes the current subscription", async () => {
    env = installPush();
    const sub = fakeSub();
    env.getSubscription.mockResolvedValue(sub);
    await unsubscribeBrowser();
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does nothing, without throwing, when there is nothing to drop or it fails", async () => {
    await expect(unsubscribeBrowser()).resolves.toBeUndefined(); // unsupported
    env = installPush();
    await expect(unsubscribeBrowser()).resolves.toBeUndefined(); // no subscription
    const sub = fakeSub();
    sub.unsubscribe.mockRejectedValue(new Error("gone"));
    env.getSubscription.mockResolvedValue(sub);
    await expect(unsubscribeBrowser()).resolves.toBeUndefined();
    env.getRegistration.mockResolvedValue(undefined);
    await expect(unsubscribeBrowser()).resolves.toBeUndefined(); // no worker
  });
});

describe("isSubscriptionSaved", () => {
  it("looks up this endpoint only", async () => {
    const { sb, calls } = fakeSupabase(() => ({ data: [{ endpoint: KEYS.endpoint }] }));
    expect(await isSubscriptionSaved(sb, KEYS.endpoint)).toBe(true);
    expect(calls[0]).toMatchObject({ table: "push_subscriptions", op: "select" });
    expect(calls[0]!.filters).toContainEqual(["eq", "endpoint", KEYS.endpoint]);
  });

  it("is false on no rows, an error or a throw", async () => {
    expect(await isSubscriptionSaved(fakeSupabase(() => ({ data: [] })).sb, "e")).toBe(false);
    expect(
      await isSubscriptionSaved(
        fakeSupabase(() => ({ data: [{}], error: { message: "rls" } })).sb,
        "e",
      ),
    ).toBe(false);
    expect(
      await isSubscriptionSaved(
        fakeSupabase(() => {
          throw new Error("offline");
        }).sb,
        "e",
      ),
    ).toBe(false);
  });
});

describe("isFullError", () => {
  it("tells the account limit apart from other check violations with the same code", () => {
    expect(isFullError({ code: "23514", message: "push subscriptions are full (5)" })).toBe(true);
    expect(isFullError({ code: "23514", message: "endpoint must be https" })).toBe(false);
    expect(isFullError({ code: "23514" })).toBe(false);
    expect(isFullError({ code: "42501", message: "are full" })).toBe(false);
  });
});

describe("saveSubscription", () => {
  it("inserts a new browser with the user id and both keys", async () => {
    const { sb, calls } = fakeSupabase((c) => (c.op === "select" ? { data: [] } : {}));
    expect(await saveSubscription(sb, "u1", KEYS)).toBe("saved");
    expect(calls[1]).toMatchObject({
      table: "push_subscriptions",
      op: "insert",
      payload: { user_id: "u1", endpoint: KEYS.endpoint, p256dh: "P", auth: "A" },
    });
  });

  it("updates the keys of a browser already saved under the same address", async () => {
    const { sb, calls } = fakeSupabase((c) =>
      c.op === "select" ? { data: [{ endpoint: 1 }] } : {},
    );
    expect(await saveSubscription(sb, "u1", { ...KEYS, p256dh: "P2", auth: "A2" })).toBe("saved");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ op: "update", payload: { p256dh: "P2", auth: "A2" } });
    expect(calls[1]!.filters).toContainEqual(["eq", "endpoint", KEYS.endpoint]);
  });

  it("reports full for the account-limit error and failed for anything else", async () => {
    const full = fakeSupabase((c) =>
      c.op === "select" ? { data: [] } : { error: { code: "23514", message: "browsers are full" } },
    );
    expect(await saveSubscription(full.sb, "u1", KEYS)).toBe("full");

    const other = fakeSupabase((c) =>
      c.op === "select" ? { data: [] } : { error: { code: "23514", message: "bad endpoint" } },
    );
    expect(await saveSubscription(other.sb, "u1", KEYS)).toBe("failed");

    const upd = fakeSupabase((c) =>
      c.op === "select" ? { data: [{}] } : { error: { message: "nope" } },
    );
    expect(await saveSubscription(upd.sb, "u1", KEYS)).toBe("failed");

    const thrown = fakeSupabase((c) => {
      if (c.op === "insert") throw new Error("offline");
      return { data: [] };
    });
    expect(await saveSubscription(thrown.sb, "u1", KEYS)).toBe("failed");
  });
});

describe("deleteSubscription", () => {
  it("deletes by endpoint and reports success", async () => {
    const { sb, calls } = fakeSupabase(() => ({}));
    expect(await deleteSubscription(sb, KEYS.endpoint)).toBe(true);
    expect(calls[0]).toMatchObject({ table: "push_subscriptions", op: "delete" });
    expect(calls[0]!.filters).toEqual([["eq", "endpoint", KEYS.endpoint]]);
  });

  it("is false on an error or a throw", async () => {
    expect(await deleteSubscription(fakeSupabase(() => ({ error: {} })).sb, "e")).toBe(false);
    const t = fakeSupabase(() => {
      throw new Error("x");
    });
    expect(await deleteSubscription(t.sb, "e")).toBe(false);
  });
});

const area = { lat: 40.6, lon: -73.8, radiusNm: 20, label: "JFK" };
function rule(id: string, conditions: AlertRule["conditions"], enabled = true): AlertRule {
  return { id, name: "Rule " + id, enabled, createdAt: 1, conditions };
}

describe("syncPushRules", () => {
  it("deletes rules that are gone, updates the ones kept and inserts new ones, skipping rules without an area", async () => {
    const { sb, calls } = fakeSupabase((c) =>
      c.op === "select" ? { data: [{ rule_id: "keep" }, { rule_id: "gone" }] } : {},
    );
    const rules = [
      rule("keep", { area, military: true }, false),
      rule("new", { area }),
      rule("noarea", { military: true }),
      rule("huge", { area: { ...area, radiusNm: 400 } }),
    ];
    expect(await syncPushRules(sb, "u1", rules)).toBe(true);

    const ops = calls.map((c) => c.op);
    expect(ops).toEqual(["select", "delete", "update", "insert"]);
    expect(calls[1]!.filters).toEqual([["in", "rule_id", ["gone"]]]);
    expect(calls[2]!.payload).toMatchObject({
      name: "Rule keep",
      enabled: false,
      conditions: { area, military: true },
    });
    expect(typeof (calls[2]!.payload as { updated_at: string }).updated_at).toBe("string");
    expect(calls[2]!.filters).toEqual([["eq", "rule_id", "keep"]]);
    expect(calls[3]!.payload).toEqual([
      { rule_id: "new", name: "Rule new", conditions: { area }, enabled: true, user_id: "u1" },
    ]);
  });

  it("only reads when the server already matches nothing to add or remove", async () => {
    const { sb, calls } = fakeSupabase(() => ({ data: [] }));
    expect(await syncPushRules(sb, "u1", [rule("noarea", { military: true })])).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(["select"]);
  });

  it.each(["select", "delete", "update", "insert"] as const)(
    "stops and reports false when the %s fails",
    async (failing) => {
      const { sb, calls } = fakeSupabase((c) => {
        if (c.op === failing) return { error: { message: "rls" } };
        return c.op === "select" ? { data: [{ rule_id: "keep" }, { rule_id: "gone" }] } : {};
      });
      const ok = await syncPushRules(sb, "u1", [rule("keep", { area }), rule("new", { area })]);
      expect(ok).toBe(false);
      expect(calls.at(-1)!.op).toBe(failing);
    },
  );

  it("reports false when the client throws", async () => {
    const { sb } = fakeSupabase(() => {
      throw new Error("offline");
    });
    expect(await syncPushRules(sb, "u1", [])).toBe(false);
  });
});

describe("clearPushRules", () => {
  it("deletes every rule the account has", async () => {
    const { sb, calls } = fakeSupabase((c) =>
      c.op === "select" ? { data: [{ rule_id: "a" }, { rule_id: "b" }] } : {},
    );
    expect(await clearPushRules(sb)).toBe(true);
    expect(calls[1]).toMatchObject({ op: "delete", filters: [["in", "rule_id", ["a", "b"]]] });
  });

  it("does not send a delete when there is nothing to remove", async () => {
    const { sb, calls } = fakeSupabase(() => ({ data: null }));
    expect(await clearPushRules(sb)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("is false when reading or deleting fails, or the client throws", async () => {
    expect(await clearPushRules(fakeSupabase(() => ({ error: { message: "x" } })).sb)).toBe(false);
    const del = fakeSupabase((c) =>
      c.op === "select" ? { data: [{ rule_id: "a" }] } : { error: { message: "x" } },
    );
    expect(await clearPushRules(del.sb)).toBe(false);
    const t = fakeSupabase(() => {
      throw new Error("x");
    });
    expect(await clearPushRules(t.sb)).toBe(false);
  });
});
