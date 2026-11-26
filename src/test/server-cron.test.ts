import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KEEPALIVE_CRON } from "@/lib/supabase-keepalive.server";
import pushCron, { PUSH_CRON, runScheduledPushCheck } from "@/server/push-cron";

/* The Worker's cron triggers: the two-minute closed-page alert check and the daily Supabase keep-alive. */

const keepalive = vi.hoisted(() => ({ run: vi.fn(async () => ({ ok: true, status: 200 })) }));

vi.mock("@/lib/supabase-keepalive.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase-keepalive.server")>()),
  runSupabaseKeepalive: keepalive.run,
}));
// The plugin helper only wraps the setup function.
vi.mock("nitro", () => ({ definePlugin: (fn: unknown) => fn }));

type Scheduled = (e: { controller?: { cron?: string }; env?: unknown }) => Promise<void>;

function hooksFor(plugin: (nitro: never) => void): Scheduled {
  let handler: Scheduled | undefined;
  plugin({
    hooks: {
      hook: (name: string, fn: Scheduled) => {
        expect(name).toBe("cloudflare:scheduled");
        handler = fn;
      },
    },
  } as never);
  if (!handler) throw new Error("no cloudflare:scheduled hook");
  return handler;
}

function pushHub(check: () => Promise<unknown>) {
  const idFromName = vi.fn((n: string) => "id:" + n);
  const get = vi.fn(() => ({ check: vi.fn(check) }));
  return { ns: { idFromName, get }, idFromName, get };
}

const VAPID = "private-key";

describe("scheduled push check", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    err = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
    err.mockRestore();
  });

  it("runs every two minutes, a different schedule from the keep-alive", () => {
    expect(PUSH_CRON).toBe("*/2 * * * *");
    expect(PUSH_CRON).not.toBe(KEEPALIVE_CRON);
  });

  it("asks the one global PushHub and logs the report", async () => {
    const report = { rules: 2, circles: 1, sent: 1 };
    const hub = pushHub(async () => report);
    await runScheduledPushCheck({
      controller: { cron: PUSH_CRON },
      env: { PUSH_HUB: hub.ns, VAPID_PRIVATE_KEY: VAPID },
    });
    expect(hub.idFromName).toHaveBeenCalledWith("global");
    expect(hub.get).toHaveBeenCalledWith("id:global");
    expect(log).toHaveBeenCalledWith("[push-check]", JSON.stringify(report));
  });

  it("ignores other cron triggers", async () => {
    const hub = pushHub(async () => ({}));
    await runScheduledPushCheck({
      controller: { cron: KEEPALIVE_CRON },
      env: { PUSH_HUB: hub.ns, VAPID_PRIVATE_KEY: VAPID },
    });
    await runScheduledPushCheck({ env: { PUSH_HUB: hub.ns, VAPID_PRIVATE_KEY: VAPID } });
    expect(hub.get).not.toHaveBeenCalled();
  });

  it("does nothing without the binding (dev server, tests)", async () => {
    await expect(runScheduledPushCheck({ controller: { cron: PUSH_CRON } })).resolves.toBe(
      undefined,
    );
    await expect(
      runScheduledPushCheck({
        controller: { cron: PUSH_CRON },
        env: { PUSH_HUB: {} as never, VAPID_PRIVATE_KEY: VAPID },
      }),
    ).resolves.toBe(undefined);
    expect(log).not.toHaveBeenCalled();
  });

  it("does not wake the object before the VAPID private key is set", async () => {
    const hub = pushHub(async () => "not-configured");
    for (const key of [undefined, "", "   ", 42]) {
      await runScheduledPushCheck({
        controller: { cron: PUSH_CRON },
        env: { PUSH_HUB: hub.ns, VAPID_PRIVATE_KEY: key },
      });
    }
    expect(hub.get).not.toHaveBeenCalled();
  });

  it("logs nothing for a bare answer such as busy", async () => {
    const hub = pushHub(async () => "busy");
    await runScheduledPushCheck({
      controller: { cron: PUSH_CRON },
      env: { PUSH_HUB: hub.ns, VAPID_PRIVATE_KEY: VAPID },
    });
    expect(hub.get).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("never throws out of the cron handler, and logs only the error message", async () => {
    const failing = pushHub(async () => {
      throw new Error("object reset");
    });
    await expect(
      runScheduledPushCheck({
        controller: { cron: PUSH_CRON },
        env: { PUSH_HUB: failing.ns, VAPID_PRIVATE_KEY: VAPID },
      }),
    ).resolves.toBe(undefined);
    expect(err).toHaveBeenCalledWith("[push-check] failed:", "object reset");

    const odd = pushHub(async () => {
      throw { secret: "do not log me" };
    });
    await runScheduledPushCheck({
      controller: { cron: PUSH_CRON },
      env: { PUSH_HUB: odd.ns, VAPID_PRIVATE_KEY: VAPID },
    });
    expect(err).toHaveBeenLastCalledWith("[push-check] failed:", "unknown error");
    expect(JSON.stringify(err.mock.calls)).not.toContain("do not log me");
  });

  it("registers itself on the Worker's scheduled hook", async () => {
    const handler = hooksFor(pushCron as never);
    const hub = pushHub(async () => ({ sent: 0 }));
    await handler({
      controller: { cron: PUSH_CRON },
      env: { PUSH_HUB: hub.ns, VAPID_PRIVATE_KEY: VAPID },
    });
    expect(hub.get).toHaveBeenCalledTimes(1);
  });
});

describe("keep-alive plugin", () => {
  beforeEach(() => keepalive.run.mockClear());

  it("pings Supabase on the daily trigger only, with the Worker's bindings", async () => {
    const { default: plugin } = await import("@/server/keepalive.plugin");
    const handler = hooksFor(plugin as never);
    const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };
    await handler({ controller: { cron: PUSH_CRON }, env });
    expect(keepalive.run).not.toHaveBeenCalled();
    await handler({ controller: { cron: KEEPALIVE_CRON }, env });
    expect(keepalive.run).toHaveBeenCalledTimes(1);
    expect(keepalive.run).toHaveBeenCalledWith(env);
  });
});
