import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

/*
 * Shared fakes for the hooks-ui tests: a chainable Supabase query builder that records every call, and a browser
 * with (or without) service worker, PushManager and Notification.
 */

export interface SbCall {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  payload: unknown;
  filters: Array<[string, ...unknown[]]>;
}

export type SbResult = { data?: unknown; error?: { code?: string; message?: string } | null };

/** A Supabase client whose queries are answered by `answer`, in the order they are awaited. */
export function fakeSupabase(answer: (call: SbCall) => SbResult | Promise<SbResult>) {
  const calls: SbCall[] = [];
  const sb = {
    from(table: string) {
      const call: SbCall = { table, op: "select", payload: undefined, filters: [] };
      let opSet = false;
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "upsert"] as const) {
        builder[op] = (payload?: unknown) => {
          if (!opSet) {
            call.op = op;
            call.payload = payload;
            opSet = true;
          }
          return builder;
        };
      }
      for (const f of ["eq", "in", "limit", "order", "neq"]) {
        builder[f] = (...args: unknown[]) => {
          call.filters.push([f, ...args]);
          return builder;
        };
      }
      builder["then"] = (
        resolve: (v: SbResult) => unknown,
        reject: (e: unknown) => unknown,
      ): Promise<unknown> => {
        calls.push(call);
        return Promise.resolve()
          .then(() => answer(call))
          .then((r) => ({ data: null, error: null, ...r }))
          .then(resolve, reject);
      };
      return builder;
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

export interface FakePushSub {
  endpoint: string;
  keys: { p256dh?: string; auth?: string };
  unsubscribe: ReturnType<typeof vi.fn>;
}

export function fakeSub(endpoint = "https://push.example/abc", keys = { p256dh: "P", auth: "A" }) {
  const s: FakePushSub = { endpoint, keys, unsubscribe: vi.fn(async () => true) };
  return Object.assign(s, { toJSON: () => ({ endpoint: s.endpoint, keys: s.keys }) });
}

export interface PushEnv {
  getRegistration: ReturnType<typeof vi.fn>;
  getSubscription: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
  setPermission(p: NotificationPermission): void;
  restore(): void;
}

/** Install a push-capable browser. Pass `parts` to leave out one of the three APIs. */
export function installPush(
  parts: { serviceWorker?: boolean; pushManager?: boolean; notification?: boolean } = {},
): PushEnv {
  const { serviceWorker = true, pushManager = true, notification = true } = parts;
  let permission: NotificationPermission = "default";
  const getSubscription = vi.fn(async () => null as unknown);
  const subscribe = vi.fn(async () => fakeSub() as unknown);
  const reg = { pushManager: { getSubscription, subscribe } };
  const getRegistration = vi.fn(async () => reg as unknown);
  const requestPermission = vi.fn(async () => {
    permission = "granted";
    return permission;
  });

  if (serviceWorker) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration },
    });
  }
  if (pushManager) vi.stubGlobal("PushManager", function PushManager() {});
  if (notification) {
    const N = {
      get permission() {
        return permission;
      },
      requestPermission,
    };
    vi.stubGlobal("Notification", N);
  }
  return {
    getRegistration,
    getSubscription,
    subscribe,
    requestPermission,
    setPermission(p) {
      permission = p;
    },
    restore() {
      // Only remove what this call added; jsdom has none of the three.
      if (serviceWorker) delete (navigator as unknown as Record<string, unknown>)["serviceWorker"];
      vi.unstubAllGlobals();
    },
  };
}
