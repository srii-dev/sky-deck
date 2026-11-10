/*
 * Refresh budget for the aircraft feed (Phase 19i). The free data providers allow only so many requests, and one
 * server can start only about two a second, so the server keeps a budget of upstream requests per minute. While the
 * budget is mostly unused every tile is refreshed as soon as it is asked for. As it fills up, the busiest tiles (the
 * ones the most visitors are looking at) keep refreshing and the rarely watched ones are answered from a slightly

 * older copy. When it is used up, every tile is answered from its copy until that is too old to use. Refreshes that
 * cannot be avoided (a tile with no copy, or a copy past the hard age limit) are always made and are not counted
 * against the budget: an empty or very old map is worse than a late one. So the real rate is the budget plus about one
 * request per tile per hard limit. Per server instance, in memory.
 * Pure logic with an injected clock.
 */

export interface BudgetOptions {
  /** Upstream requests allowed per window; 0 or less means no limit. */
  perWindow: number;
  windowMs?: number;
  /** Below this share of the budget every tile refreshes. */
  softShare?: number;
  /** The oldest copy served to a quiet tile while the budget is filling up, ms. */
  staleSoftMs?: number;
  /** The oldest copy served once the budget is used up, ms. Older copies are always refreshed. */
  staleHardMs?: number;
}

export type BudgetDecision = "refresh" | "stale";

export const DEFAULT_BUDGET_PER_MINUTE = 90;

export class RefreshBudget {
  private readonly perWindow: number;
  private readonly windowMs: number;
  private readonly softShare: number;
  private readonly staleSoftMs: number;
  private readonly staleHardMs: number;
  private upstream: number[] = [];
  private demand = new Map<string, number[]>();

  constructor(opts: BudgetOptions) {
    this.perWindow = opts.perWindow;
    this.windowMs = opts.windowMs ?? 60_000;
    this.softShare = opts.softShare ?? 0.6;
    this.staleSoftMs = opts.staleSoftMs ?? 30_000;
    this.staleHardMs = opts.staleHardMs ?? 60_000;
  }

  private static trim(list: number[], cutoff: number): number[] {
    let i = 0;
    while (i < list.length && list[i]! < cutoff) i++;
    return i === 0 ? list : list.slice(i);
  }

  /** Someone asked for this tile. */
  noteRequest(key: string, now: number): void {
    const cutoff = now - this.windowMs;
    const list = RefreshBudget.trim(this.demand.get(key) ?? [], cutoff);
    list.push(now);
    this.demand.set(key, list);
    // Forget tiles nobody has asked for lately, so the map cannot grow without limit.
    if (this.demand.size > 2000) {
      for (const [k, v] of this.demand) {
        if (v.length === 0 || v[v.length - 1]! < cutoff) this.demand.delete(k);
      }
    }
  }

  /** A real upstream request is starting. `mandatory` ones (no copy, or one past the hard limit) are not counted. */
  noteUpstream(now: number, mandatory = false): void {
    if (mandatory) return;
    this.upstream = RefreshBudget.trim(this.upstream, now - this.windowMs);
    this.upstream.push(now);
  }

  /** True when a copy of this age must be refreshed whatever the budget says. */
  mustRefresh(ageMs: number): boolean {
    return ageMs > this.staleHardMs;
  }

  /** Upstream requests started in the current window. */
  used(now: number): number {
    this.upstream = RefreshBudget.trim(this.upstream, now - this.windowMs);
    return this.upstream.length;
  }

  /**
   * 0 for the busiest tile, 1 for the quietest: the share of other tiles that are asked for more often.
   * Tiles with equal demand share a rank.
   */
  demandRank(key: string, now: number): number {
    const cutoff = now - this.windowMs;
    const mine = RefreshBudget.trim(this.demand.get(key) ?? [], cutoff).length;
    let busier = 0;
    let total = 0;
    for (const v of this.demand.values()) {
      const n = RefreshBudget.trim(v, cutoff).length;
      if (n === 0) continue;
      total++;
      if (n > mine) busier++;
    }
    return total <= 1 ? 0 : busier / (total - 1);
  }

  /**
   * What to do with a tile whose copy is `ageMs` old and no longer fresh. Never called for a tile with no copy.
   * "stale" means serve the copy; "refresh" means fetch it again.
   */
  decide(key: string, ageMs: number, now: number): BudgetDecision {
    if (this.perWindow <= 0) return "refresh";
    if (ageMs > this.staleHardMs) return "refresh";
    const share = this.used(now) / this.perWindow;
    if (share < this.softShare) return "refresh";
    if (share >= 1) return "stale";
    // Filling up: the allowed share of tiles shrinks from all (at softShare) to none (at 1).
    const allowed = (1 - share) / (1 - this.softShare);
    if (this.demandRank(key, now) <= allowed) return "refresh";
    return ageMs <= this.staleSoftMs ? "stale" : "refresh";
  }
}

/** The per-minute budget from a variable: a whole number, 0 for no limit, the default when unset or unusable. */
export function budgetFromEnv(raw: string | undefined | null): number {
  const t = (raw ?? "").trim();
  if (!/^\d{1,5}$/.test(t)) return DEFAULT_BUDGET_PER_MINUTE;
  return Number(t);
}
