import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcarsAiInput } from "@/lib/acars-ai";
import type { AiPacingState } from "@/lib/ai.server";
import { utcDay } from "@/lib/ai-service";

import { fakeCtx, type FakeCtx } from "./server-do-fake";

/*
 * The AiHub Durable Object (decision 2026-11-23). AGENTS.md: ACARS text, headlines and AI answers stay in memory;
 * only the pacing counters (calls per provider and day, provider pauses) are written to storage.
 */

type Hub = InstanceType<typeof import("@/server/ai-hub").AiHub>;

// The AI service, its budgets and caches are module state: every test gets a fresh copy.
async function hubWith(env: Record<string, unknown>, saved: Record<string, unknown> = {}) {
  const { AiHub } = await import("@/server/ai-hub");
  const ctx = fakeCtx(saved);
  const hub: Hub = new AiHub(ctx as never, env);
  await ctx.ready;
  return { hub, ctx };
}

function stored(ctx: FakeCtx): AiPacingState {
  return ctx.data.get("pacing") as AiPacingState;
}

const PROMPT = "Explain SECRET-PROMPT-TEXT to a passenger";
const ANSWER = "PRIVATE-MODEL-ANSWER about the flight";

const acars = (id: number, text: string): AcarsAiInput => ({
  id,
  flight: "UAL1",
  tail: "N123UA",
  label: "H1",
  route: null,
  sourceType: null,
  text,
});

describe("AiHub", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("answers null and writes nothing when no provider is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { hub, ctx } = await hubWith({});
    expect(await hub.generate({ task: "t", prompt: PROMPT })).toBeNull();
    expect(await hub.acarsBriefs([acars(1, "POS REPORT")])).toBeNull();
    expect(ctx.writes).toHaveLength(0);
  });

  it("saves only the call counters after an answer, never the prompt or the answer", async () => {
    const run = vi.fn(async () => ({ response: ANSWER }));
    const { hub, ctx } = await hubWith({ AI: { run } });
    const r = await hub.generate({ task: "explain", prompt: PROMPT });
    expect(r).toMatchObject({ ok: true, value: { text: ANSWER, provider: "workers-ai" } });
    expect(ctx.writes.map((w) => w.key)).toEqual(["pacing"]);
    const state = stored(ctx);
    expect(Object.keys(state).sort()).toEqual(["counts", "paused"]);
    expect(state.counts).toEqual([["workers-ai|" + utcDay(Date.now()), 1]]);
    expect(state.paused).toEqual([]);
    const json = JSON.stringify(ctx.writes);
    expect(json).not.toContain("SECRET-PROMPT-TEXT");
    expect(json).not.toContain("PRIVATE-MODEL-ANSWER");
  });

  it("does not write on a cache hit", async () => {
    const run = vi.fn(async () => ({ response: ANSWER }));
    const { hub, ctx } = await hubWith({ AI: { run } });
    await hub.generate({ task: "explain", prompt: PROMPT });
    const again = await hub.generate({ task: "explain", prompt: PROMPT });
    expect(again).toMatchObject({ ok: true, value: { cached: true } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(ctx.writes).toHaveLength(1);
  });

  it("keeps ACARS text and headlines out of storage", async () => {
    const run = vi.fn(async () => ({
      response: JSON.stringify([{ id: 1, brief: "HEADLINE-ONE" }]),
    }));
    const { hub, ctx } = await hubWith({ AI: { run } });
    const r = await hub.acarsBriefs([acars(7, "MEDICAL ON BOARD SEAT 12C")]);
    expect(r).toMatchObject({ ok: true, value: { briefs: { 7: "HEADLINE-ONE" } } });
    expect(ctx.writes).toHaveLength(1);
    const json = JSON.stringify([...ctx.data]);
    for (const secret of ["MEDICAL", "12C", "HEADLINE-ONE", "UAL1", "N123UA"])
      expect(json).not.toContain(secret);
    // Same message again: answered from the headline cache, nothing spent, nothing written.
    await hub.acarsBriefs([acars(7, "MEDICAL ON BOARD SEAT 12C")]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(ctx.writes).toHaveLength(1);
  });

  it("restores a saved daily pause, so a restarted object does not spend past the limit", async () => {
    const run = vi.fn(async () => ({ response: ANSWER }));
    const saved: AiPacingState = {
      counts: [],
      paused: [["workers-ai", { until: Date.now() + 3_600_000, daily: true }]],
    };
    const { hub, ctx } = await hubWith({ AI: { run } }, { pacing: saved });
    expect(await hub.generate({ task: "t", prompt: PROMPT })).toMatchObject({
      ok: false,
      reason: "budget",
    });
    expect(run).not.toHaveBeenCalled();
    // Nothing changed since the restore: no write.
    expect(ctx.writes).toHaveLength(0);
  });

  it("restores the saved daily counts", async () => {
    const run = vi.fn(async () => ({ response: ANSWER }));
    const key = "workers-ai|" + utcDay(Date.now());
    const { hub, ctx } = await hubWith(
      { AI: { run } },
      { pacing: { counts: [[key, 9]], paused: [] } },
    );
    await hub.generate({ task: "t", prompt: PROMPT });
    expect(stored(ctx).counts).toEqual([[key, 10]]);
  });

  it("answers a provider failure as data and saves the pause it caused", async () => {
    const run = vi.fn(async () => {
      throw new Error("3040: Capacity temporarily exceeded");
    });
    const { hub, ctx } = await hubWith({ AI: { run } });
    const r = await hub.generate({ task: "t", prompt: PROMPT });
    expect(r).toMatchObject({ ok: false, reason: "busy" });
    expect(typeof (r as { message: string }).message).toBe("string");
    const [[name, pause]] = stored(ctx).paused as unknown as [[string, { daily: boolean }]];
    expect(name).toBe("workers-ai");
    expect(pause.daily).toBe(false);
    expect(JSON.stringify(ctx.writes)).not.toContain("SECRET-PROMPT-TEXT");
  });

  it("reads secrets from the object's own env, and honours the kill switch", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "gem" }] } }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { hub } = await hubWith({ GEMINI_API_KEY: "K", AI: { notRun: true } });
    expect(await hub.generate({ task: "t", prompt: PROMPT })).toMatchObject({
      ok: true,
      value: { text: "gem", provider: "gemini" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const off = await hubWith({ GEMINI_API_KEY: "K", AI_ENABLED: "off" });
    expect(await off.hub.generate({ task: "t", prompt: "other" })).toMatchObject({
      ok: false,
      reason: "disabled",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(off.ctx.writes).toHaveLength(0);
  });
});
