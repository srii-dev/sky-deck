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

export class QuotaGuard {
  private state: QuotaState;
  private readonly longest: number;

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

  snapshot(): QuotaState {
    return structuredClone(this.state);
  }
}
