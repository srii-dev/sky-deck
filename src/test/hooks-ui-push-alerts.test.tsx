import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthStatus } from "@/hooks/use-auth";
import { usePushAlerts } from "@/hooks/use-push-alerts";
import type { AlertRule } from "@/lib/alert-rules";
import { getPushConfig } from "@/lib/push.functions";
import { getSupabase } from "@/lib/supabase-client";

import { fakeSub, fakeSupabase, installPush, type PushEnv, type SbCall } from "./hooks-ui-fakes";

/* The closed-page alerts switch (Phase 10f) driven against a fake browser and a fake Supabase. */

vi.mock("@/lib/push.functions", () => ({ getPushConfig: vi.fn() }));
vi.mock("@/lib/supabase-client", () => ({ getSupabase: vi.fn() }));

const config = vi.mocked(getPushConfig);
const supabase = vi.mocked(getSupabase);

let env: PushEnv;
let sbCalls: SbCall[];
/** What the fake database answers; tests override pieces of it. */
let answer: (c: SbCall) => { data?: unknown; error?: { code?: string; message?: string } | null };

const area = { lat: 40.6, lon: -73.8, radiusNm: 20, label: "JFK" };
const RULES: AlertRule[] = [
  { id: "r1", name: "JFK", enabled: true, createdAt: 1, conditions: { area } },
];

beforeEach(() => {
  vi.useFakeTimers();
  env = installPush();
  config.mockResolvedValue({ configured: true, publicKey: "AQID" });
  answer = (c) => (c.op === "select" ? { data: [] } : {});
  const fake = fakeSupabase((c) => answer(c));
  sbCalls = fake.calls;
  supabase.mockResolvedValue(fake.sb);
});

afterEach(() => {
  env.restore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Let the hook's chains of awaits finish (no timers move). */
async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

interface Props {
  active: boolean;
  authStatus: AuthStatus;
  userId: string | null;
  rules: readonly AlertRule[];
}
const signedIn: Props = { active: true, authStatus: "signed-in", userId: "u1", rules: RULES };

async function mount(props: Partial<Props> = {}) {
  const r = renderHook((p: Props) => usePushAlerts(p), {
    initialProps: { ...signedIn, ...props },
  });
  await settle();
  return r;
}

describe("usePushAlerts: working out the state", () => {
  it("asks the server nothing until the dialog has opened", async () => {
    const { result, rerender } = await mount({ active: false });
    expect(result.current.status).toBe("loading");
    expect(config).not.toHaveBeenCalled();
    rerender({ ...signedIn, active: true });
    await settle();
    expect(config).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("off");
  });

  it("is unsupported without the push APIs, before asking the server", async () => {
    env.restore();
    env = installPush({ pushManager: false });
    const { result } = await mount();
    expect(result.current.status).toBe("unsupported");
    expect(config).not.toHaveBeenCalled();
  });

  it.each([
    ["not configured", () => config.mockResolvedValue({ configured: false, publicKey: null })],
    [
      "configured without a key",
      () => config.mockResolvedValue({ configured: true, publicKey: null }),
    ],
    ["unreachable", () => config.mockRejectedValue(new Error("offline"))],
  ])("is unavailable when the server is %s", async (_n, setup) => {
    setup();
    const { result } = await mount();
    expect(result.current.status).toBe("unavailable");
  });

  it("is signed-out without an account", async () => {
    const { result } = await mount({ authStatus: "signed-out", userId: null });
    expect(result.current.status).toBe("signed-out");
  });

  it("is denied when the site's notifications are blocked", async () => {
    env.setPermission("denied");
    const { result } = await mount();
    expect(result.current.status).toBe("denied");
  });

  it("is on only when this browser's subscription is saved to the account", async () => {
    env.getSubscription.mockResolvedValue(fakeSub());
    answer = (c) => (c.op === "select" ? { data: [{ endpoint: "x" }] } : {});
    const { result } = await mount();
    expect(result.current.status).toBe("on");
  });

  it("is off when subscribed in the browser but not saved, or not subscribed at all", async () => {
    env.getSubscription.mockResolvedValue(fakeSub());
    expect((await mount()).result.current.status).toBe("off");
    env.getSubscription.mockResolvedValue(null);
    expect((await mount()).result.current.status).toBe("off");
  });
});

describe("usePushAlerts: enable", () => {
  it("subscribes, saves the browser and turns on", async () => {
    const { result } = await mount();
    await act(() => result.current.enable());
    expect(result.current.status).toBe("on");
    expect(result.current.error).toBeNull();
    expect(sbCalls.some((c) => c.op === "insert" && c.table === "push_subscriptions")).toBe(true);
  });

  it.each([
    [
      "denied",
      () => env.requestPermission.mockResolvedValue("denied"),
      "denied",
      /blocked for this site/,
    ],
    [
      "no-worker",
      () => env.getRegistration.mockResolvedValue(undefined),
      "off",
      /no service worker yet/,
    ],
    ["failed", () => env.subscribe.mockRejectedValue(new Error("x")), "off", /could not subscribe/],
  ])("explains a %s subscription", async (_n, setup, status, message) => {
    const { result } = await mount();
    setup();
    await act(() => result.current.enable());
    expect(result.current.status).toBe(status);
    expect(result.current.error).toMatch(message);
  });

  it("drops the browser subscription again when the account already has 5 browsers", async () => {
    const sub = fakeSub();
    env.subscribe.mockResolvedValue(sub);
    answer = (c) =>
      c.op === "insert"
        ? { error: { code: "23514", message: "push subscriptions are full" } }
        : { data: [] };
    const { result } = await mount();
    env.getSubscription.mockResolvedValue(null);
    // subscribeBrowser reads no existing subscription, unsubscribeBrowser then finds the new one.
    env.getSubscription.mockResolvedValueOnce(null).mockResolvedValue(sub);
    await act(() => result.current.enable());
    expect(result.current.status).toBe("off");
    expect(result.current.error).toMatch(/already has 5 browsers/);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it("reports a failed save, including when Supabase is not available", async () => {
    answer = (c) => (c.op === "insert" ? { error: { message: "rls" } } : { data: [] });
    const { result } = await mount();
    await act(() => result.current.enable());
    expect(result.current.error).toMatch(/Could not save this browser/);

    supabase.mockResolvedValue(null);
    await act(() => result.current.enable());
    expect(result.current.status).toBe("off");
    expect(result.current.error).toMatch(/Could not save this browser/);
  });

  it("does nothing before the public key is known or without an account", async () => {
    const { result } = await mount({ active: false });
    await act(() => result.current.enable());
    expect(env.requestPermission).not.toHaveBeenCalled();
    expect(result.current.status).toBe("loading");
  });
});

describe("usePushAlerts: keeping rules in step", () => {
  async function mountOn(rules: readonly AlertRule[] = RULES) {
    env.getSubscription.mockResolvedValue(fakeSub());
    answer = (c) =>
      c.table === "push_subscriptions" && c.op === "select"
        ? { data: [{ endpoint: "x" }] }
        : { data: [] };
    return mount({ rules });
  }
  const pushRuleWrites = () => sbCalls.filter((c) => c.table === "push_rules" && c.op !== "select");

  it("syncs the rules 1.5 s after turning on, once, even when they change meanwhile", async () => {
    const { result, rerender } = await mountOn();
    expect(result.current.status).toBe("on");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(sbCalls.filter((c) => c.table === "push_rules")).toHaveLength(0);

    const more = [...RULES, { ...RULES[0]!, id: "r2", name: "Second" }];
    rerender({ ...signedIn, rules: more });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(sbCalls.filter((c) => c.table === "push_rules")).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(600));
    await settle();
    const inserts = pushRuleWrites().filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0]!.payload as { rule_id: string }[]).map((r) => r.rule_id)).toEqual([
      "r1",
      "r2",
    ]);
    expect(result.current.error).toBeNull();
  });

  it("says so when the rules could not be saved", async () => {
    const { result } = await mountOn();
    answer = () => ({ error: { message: "offline" } });
    await act(() => vi.advanceTimersByTimeAsync(1600));
    await settle();
    expect(result.current.error).toMatch(/Could not save your rules/);
  });

  it("does not sync while off", async () => {
    await mount();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(sbCalls.filter((c) => c.table === "push_rules")).toHaveLength(0);
  });
});

describe("usePushAlerts: disable and sign-out", () => {
  it("deletes this browser, clears the rules when it was the last one, and unsubscribes", async () => {
    const sub = fakeSub();
    env.getSubscription.mockResolvedValue(sub);
    const { result } = await mount();
    answer = (c) =>
      c.op !== "select" ? {} : { data: c.table === "push_rules" ? [{ rule_id: "r1" }] : [] };
    await act(() => result.current.disable());
    expect(result.current.status).toBe("off");
    const ops = sbCalls.map((c) => c.table + ":" + c.op);
    expect(ops).toContain("push_subscriptions:delete");
    expect(ops).toContain("push_rules:delete");
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it("keeps the account's rules while another browser still has closed-page alerts", async () => {
    env.getSubscription.mockResolvedValue(fakeSub());
    const { result } = await mount();
    answer = (c) => (c.op === "select" ? { data: [{ endpoint: "other" }] } : {});
    await act(() => result.current.disable());
    expect(sbCalls.some((c) => c.table === "push_rules" && c.op === "delete")).toBe(false);
  });

  it("keeps the account's rules when the remaining browsers cannot be read", async () => {
    env.getSubscription.mockResolvedValue(fakeSub());
    const { result } = await mount();
    answer = (c) =>
      c.table === "push_subscriptions" && c.op === "select"
        ? { data: null, error: { message: "timeout" } }
        : { data: [{ rule_id: "r1" }] };
    await act(() => result.current.disable());
    expect(result.current.status).toBe("off");
    expect(sbCalls.some((c) => c.table === "push_rules" && c.op === "delete")).toBe(false);
  });

  it("unsubscribes this browser when the visitor signs out, and only then", async () => {
    const sub = fakeSub();
    env.getSubscription.mockResolvedValue(sub);
    const { rerender } = await mount({ active: false });
    rerender({ ...signedIn, active: false, authStatus: "loading" });
    await settle();
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    rerender({ ...signedIn, active: false, authStatus: "signed-in" });
    rerender({ ...signedIn, active: false, authStatus: "signed-out", userId: null });
    await settle();
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
