/*
 * Request counter for an API key with published limits (the free adsb.lol key). It counts requests actually sent
 * and says whether the next one fits every window, so the app stops before the provider answers 429: repeated 429s
 * can get a free key revoked. Pure, clock injected, state can be saved and restored (the FeedHub Durable Object keeps
 * it in its storage, so a restart does not forget the day's count).
 */

export interface QuotaLimits {
  /** Sliding windows: at most `max` requests in any `ms`. */
  sliding: readonly { ms: number; max: number }[];
  /** UTC calendar windows. */
  perDay: number;
  /** Monday 00:00 UTC to the next Monday. */
  perWeek: number;
  /** 1st of the month, UTC. */
  perMonth: number;
}

export interface QuotaState {
  /** Send times (ms) in the longest sliding window. */
  recent: number[];
  day: { key: string; count: number };
  week: { key: string; count: number };
  month: { key: string; count: number };
}

const HOUR = 3_600_000;

/**
 * The adsb.lol free key (published limits: 20 per 30 s, 120 per minute, 300 per hour, 1,000 per day, 5,000 per week,
 * 30,000 per month), kept at about 85% so requests the app does not count (routes and search made outside the feed
 * object) and clock differences never push it over.
 * shortcut: fixed to the free key; a paid key needs its own numbers, change them here.
 */
export const ADSBLOL_FREE_LIMITS: QuotaLimits = {
  sliding: [
    { ms: 30_000, max: 17 },
    { ms: 60_000, max: 100 },
    { ms: HOUR, max: 255 },
  ],
  perDay: 850,
  perWeek: 4250,
  perMonth: 25_500,
};

/**
 * Requests kept back from refreshes of tiles that already have a copy, in every window: enough for one new view
 * (MAX_CIRCLES in coverage.ts) to get all its tiles.
 */
export const NEW_TILE_RESERVE = 6;

/**
 * The longest a tile waits for its turn: past this its copy may take the next paced slot whatever its turn says,
 * so a view with many tiles (tiles x gap longer than this) still has its oldest copies refreshed in time.
 */
export const QUOTA_TURN_MAX_MS = 30 * 60_000;

const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);
const monthKey = (now: number) => new Date(now).toISOString().slice(0, 7);
/** The UTC date of the Monday that starts the week. */
function weekKey(now: number): string {
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday))
    .toISOString()
    .slice(0, 10);
}

export function freshQuotaState(): QuotaState {
  return {
    recent: [],
    day: { key: "", count: 0 },
    week: { key: "", count: 0 },
    month: { key: "", count: 0 },
  };
}

/** When the UTC day, week (next Monday) and month that contain `now` end. */
function windowEnds(now: number): [day: number, week: number, month: number] {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const date = d.getUTCDate();
  const toMonday = (8 - d.getUTCDay()) % 7 || 7;
  return [Date.UTC(y, m, date + 1), Date.UTC(y, m, date + toMonday), Date.UTC(y, m + 1, 1)];
}

export class QuotaGuard {
  private state: QuotaState;
  private readonly longest: number;
  /** When the last paced refresh was allowed (in memory only: losing it on a restart costs one early refresh). */
  private pacedAt = -Infinity;

  constructor(
    private readonly limits: QuotaLimits,
    state?: QuotaState,
  ) {
    this.state = state ? structuredClone(state) : freshQuotaState();
    this.longest = Math.max(...limits.sliding.map((w) => w.ms));
  }

  private roll(now: number) {
    const s = this.state;
    const cutoff = now - this.longest;
    if (s.recent.length && s.recent[0]! < cutoff) s.recent = s.recent.filter((t) => t >= cutoff);
    for (const [slot, key] of [
      [s.day, dayKey(now)],
      [s.week, weekKey(now)],
      [s.month, monthKey(now)],
    ] as const) {
      if (slot.key !== key) {
        slot.key = key;
        slot.count = 0;
      }
    }
  }

  /** True when one more request would stay inside every window. */
  canSend(now: number): boolean {
    this.roll(now);
    const s = this.state;
    if (s.day.count >= this.limits.perDay) return false;
    if (s.week.count >= this.limits.perWeek) return false;
    if (s.month.count >= this.limits.perMonth) return false;
    return this.limits.sliding.every((w) => s.recent.filter((t) => t > now - w.ms).length < w.max);
  }

  /** Record one request if it fits; false (and nothing recorded) if it does not. */
  take(now: number): boolean {
    if (!this.canSend(now)) return false;
    const s = this.state;
    s.recent.push(now);
    s.day.count++;
    s.week.count++;
    s.month.count++;
    return true;
  }

  /**
   * Even spending: the gap between two refreshes of tiles that already have a copy, so that what is left in each
   * window (less NEW_TILE_RESERVE) lasts until the window ends. The tightest window sets it; Infinity when any
   * window is down to its reserve. Requests for tiles with no copy are not paced, but they count, so they push the
   * next refresh back.
   */
  paceGapMs(now: number): number {
    this.roll(now);
    const s = this.state;
    const gaps = this.limits.sliding.map((w) => ({
      left: w.max - s.recent.filter((t) => t > now - w.ms).length,
      ms: w.ms,
    }));
    const [day, week, month] = windowEnds(now);
    gaps.push(
      { left: this.limits.perDay - s.day.count, ms: day - now },
      { left: this.limits.perWeek - s.week.count, ms: week - now },
      { left: this.limits.perMonth - s.month.count, ms: month - now },
    );
    return Math.max(
      ...gaps.map((g) =>
        g.left > NEW_TILE_RESERVE ? g.ms / (g.left - NEW_TILE_RESERVE) : Infinity,
      ),
    );
  }

  /**
   * Whether a tile whose copy is `ageMs` old may be refreshed now; if so the paced slot is taken. At most one
   * refresh per pace gap. The `tiles` being watched take turns: a tile waits until its copy is `tiles` gaps old,
   * the busiest (`rank` 0, from RefreshBudget.demandRank) no longer, the quietest (`rank` 1) twice as long, and
   * none longer than QUOTA_TURN_MAX_MS.
   */
  takeRefresh(now: number, ageMs: number, rank: number, tiles: number): boolean {
    const gap = this.paceGapMs(now);
    if (!Number.isFinite(gap)) return false;
    const last = Math.max(this.state.recent.at(-1) ?? -Infinity, this.pacedAt);
    const turn = Math.min(gap * Math.max(1, tiles) * (1 + rank), QUOTA_TURN_MAX_MS);
    if (now - last < gap || ageMs < turn) return false;
    this.pacedAt = now;
    return true;
  }

  snapshot(): QuotaState {
    return structuredClone(this.state);
  }
}
