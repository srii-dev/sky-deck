import { snapFeedCircle } from "./adsb-sources";
import type { Aircraft } from "./aircraft";
import {
  cleanConditions,
  evaluateRules,
  isPushEligible,
  MAX_ALERT_RULES,
  MAX_RULE_NAME,
  RULE_COOLDOWN_MS,
  type AlertRule,
  type RuleAircraft,
  type RuleEvent,
  type RuleState,
} from "./alert-rules";
import { isGoneStatus, isValidSubscription, type PushSubscriptionKeys } from "./web-push";

/*
 * The closed-page alert check (Phase 10f), as pure functions. Server only (it uses the feed's circle snapping). The scheduled job (src/server/push-hub.ts) loads the
 * rules and browsers people saved for push, asks the shared feed for the areas those rules watch, runs the same rule
 * matching the page uses (alert-rules.ts) and turns new matches into notifications.
 * Only rules with an area are checked: a rule such as "any military aircraft" would need the whole world's feed.
 * Everything is capped so one check stays inside the Workers free plan (50 outside requests per run).
 */

/** Distinct feed circles one check may load; rules beyond this wait (oldest rules first). */
export const MAX_PUSH_CIRCLES = 20;
/** Rules one check evaluates. */
export const MAX_PUSH_RULES = 300;
/** Pushes one check may send in total, and per user. */
export const MAX_PUSH_SENDS = 20;
export const MAX_PUSH_PER_USER = 3;
/** Subscriptions per user (the database allows the same). */
export const MAX_PUSH_SUBSCRIPTIONS = 5;
/** How long a push service may hold an alert for a device that is offline: older news is no use. */
export const PUSH_TTL_S = 15 * 60;
/** Extra margin around an area before the circle is snapped, so the snapped centre still covers its edge. */
const CIRCLE_MARGIN_NM = 3;

export interface PushRuleRow {
  user_id: string;
  rule_id: string;
  name: string;
  conditions: unknown;
}

export interface PushSubscriptionRow extends PushSubscriptionKeys {
  user_id: string;
}

export interface PushCircle {
  key: string;
  lat: number;
  lon: number;
  radiusNm: number;
}

export interface PlannedRule {
  userId: string;
  /** user id + ":" + rule id, so rules of different users never share state. */
  rule: AlertRule;
  circleKey: string;
}

export interface PushPlan {
  circles: PushCircle[];
  rules: PlannedRule[];
  subscriptions: Map<string, PushSubscriptionKeys[]>;
  /** Rules left out because of the caps (reported in the log as a count only). */
  skipped: number;
}

export function circleFor(area: { lat: number; lon: number; radiusNm: number }): PushCircle {
  const c = snapFeedCircle(area.lat, area.lon, area.radiusNm + CIRCLE_MARGIN_NM);
  return { ...c, key: `${c.lat},${c.lon},${c.radiusNm}` };
}

export function pushRuleKey(userId: string, ruleId: string): string {
  return userId + ":" + ruleId;
}

/** Which circles to load and which rules to check, from the rows the database returned. */
export function planPushCheck(
  ruleRows: readonly PushRuleRow[],
  subRows: readonly PushSubscriptionRow[],
): PushPlan {
  const subscriptions = new Map<string, PushSubscriptionKeys[]>();
  for (const s of subRows) {
    if (typeof s.user_id !== "string" || !isValidSubscription(s)) continue;
    const list = subscriptions.get(s.user_id) ?? [];
    if (list.length >= MAX_PUSH_SUBSCRIPTIONS) continue;
    list.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subscriptions.set(s.user_id, list);
  }

  const circles = new Map<string, PushCircle>();
  const rules: PlannedRule[] = [];
  const perUser = new Map<string, number>();
  let skipped = 0;
  for (const row of ruleRows) {
    if (typeof row.user_id !== "string" || !subscriptions.has(row.user_id)) continue;
    const ruleId = typeof row.rule_id === "string" ? row.rule_id.slice(0, 40) : "";
    const conditions = cleanConditions(row.conditions);
    if (!ruleId || !isPushEligible(conditions) || !conditions.area) continue;
    const n = perUser.get(row.user_id) ?? 0;
    if (n >= MAX_ALERT_RULES) continue;
    const circle = circleFor(conditions.area);
    if (
      rules.length >= MAX_PUSH_RULES ||
      (!circles.has(circle.key) && circles.size >= MAX_PUSH_CIRCLES)
    ) {
      skipped += 1;
      continue;
    }
    perUser.set(row.user_id, n + 1);
    circles.set(circle.key, circle);
    const name = typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim() : "";
    rules.push({
      userId: row.user_id,
      circleKey: circle.key,
      rule: {
        id: pushRuleKey(row.user_id, ruleId),
        name: name.slice(0, MAX_RULE_NAME) || "Alert rule",
        enabled: true,
        createdAt: 0,
        conditions,
      },
    });
  }
  return { circles: [...circles.values()], rules, subscriptions, skipped };
}

function toRuleAircraft(a: Aircraft): RuleAircraft {
  return {
    hex: a.hex,
    callsign: a.callsign,
    registration: a.registration,
    type: a.type,
    kind: a.kind,
    lat: a.lat,
    lon: a.lon,
    altFt: a.altFt,
    onGround: a.onGround,
    squawk: a.squawk,
    military: a.military,
    seenPos: a.seenPos,
  };
}

export interface PushEvent extends RuleEvent {
  userId: string;
  lat: number | null;
  lon: number | null;
}

/**
 * Run the rules over the loaded circles. A circle that failed to load (absent from `feeds`) keeps its rules'
 * previous matches, so a provider hiccup neither alerts again for every aircraft nor forgets them.
 */
export function evaluatePushRules(
  state: RuleState,
  plan: Pick<PushPlan, "rules">,
  feeds: ReadonlyMap<string, readonly Aircraft[]>,
  now: number,
): { events: PushEvent[]; state: RuleState } {
  const matching = new Map<string, Set<string>>();
  let lastAlert = state.lastAlert;
  const events: PushEvent[] = [];
  const byCircle = new Map<string, PlannedRule[]>();
  for (const r of plan.rules) {
    const list = byCircle.get(r.circleKey) ?? [];
    list.push(r);
    byCircle.set(r.circleKey, list);
  }
  for (const [key, planned] of byCircle) {
    const feed = feeds.get(key);
    if (!feed) {
      for (const p of planned) {
        const prev = state.matching.get(p.rule.id);
        if (prev) matching.set(p.rule.id, prev);
      }
      continue;
    }
    const aircraft = feed.map(toRuleAircraft);
    const where = new Map(aircraft.map((a) => [a.hex, a]));
    const r = evaluateRules(
      { matching: state.matching, lastAlert },
      planned.map((p) => p.rule),
      aircraft,
      now,
    );
    lastAlert = r.state.lastAlert;
    for (const [id, set] of r.state.matching) matching.set(id, set);
    const owner = new Map(planned.map((p) => [p.rule.id, p.userId]));
    for (const e of r.events) {
      const a = e.hex ? where.get(e.hex) : undefined;
      events.push({
        ...e,
        userId: owner.get(e.ruleId) ?? "",
        lat: a ? a.lat : null,
        lon: a ? a.lon : null,
      });
    }
  }
  return { events, state: { matching, lastAlert } };
}

export interface PushMessage {
  title: string;
  body: string;
  /** Same tag replaces an older notification on the device instead of stacking. */
  tag: string;
  /** A same-site path the notification opens. */
  url: string;
}

function eventUrl(e: PushEvent): string {
  const p = new URLSearchParams();
  if (e.lat != null && e.lon != null) {
    p.set("lat", e.lat.toFixed(4));
    p.set("lon", e.lon.toFixed(4));
    p.set("z", "9");
  }
  if (/^[0-9a-f]{6}$/.test(e.hex)) p.set("hex", e.hex);
  const q = p.toString();
  return q ? "/?" + q : "/";
}

/** Notifications per user: at most MAX_PUSH_PER_USER, the rest folded into one "and N more" line. */
export function messagesByUser(events: readonly PushEvent[]): Map<string, PushMessage[]> {
  const grouped = new Map<string, PushEvent[]>();
  for (const e of events) {
    if (!e.userId) continue;
    const list = grouped.get(e.userId) ?? [];
    list.push(e);
    grouped.set(e.userId, list);
  }
  const out = new Map<string, PushMessage[]>();
  for (const [user, list] of grouped) {
    const msgs: PushMessage[] = list.slice(0, MAX_PUSH_PER_USER).map((e) => ({
      title: e.title.slice(0, 80),
      body: e.detail.slice(0, 120),
      tag: "rule-" + e.ruleId.slice(e.ruleId.indexOf(":") + 1) + (e.hex ? "-" + e.hex : ""),
      url: eventUrl(e),
    }));
    const extra = list.length - msgs.length;
    if (extra > 0 && msgs.length > 0) {
      const last = msgs[msgs.length - 1]!;
      last.body =
        (last.body ? last.body + ". " : "") + `And ${extra} more alert${extra === 1 ? "" : "s"}.`;
    }
    out.set(user, msgs);
  }
  return out;
}

// ---------- state kept between checks ----------

/** Only the cooldowns are saved; which aircraft matched is kept in memory (a fresh object only learns, never floods). */
export function serializeCooldowns(state: RuleState): [string, number][] {
  return [...state.lastAlert];
}

export function restoreCooldowns(saved: unknown): RuleState {
  const lastAlert = new Map<string, number>();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (
        Array.isArray(item) &&
        typeof item[0] === "string" &&
        typeof item[1] === "number" &&
        Number.isFinite(item[1])
      )
        lastAlert.set(item[0], item[1]);
    }
  }
  return { matching: new Map(), lastAlert };
}

// ---------- one check ----------

export interface PushCheckDeps {
  loadData(): Promise<{ subs: PushSubscriptionRow[]; rules: PushRuleRow[] }>;
  /** The shared feed for one circle; an answer with `error` counts as not loaded. */
  loadFeed(circle: PushCircle): Promise<{ aircraft: Aircraft[]; error?: string | undefined }>;
  /** Encrypt and send one push; returns the push service's HTTP status. */
  send(sub: PushSubscriptionKeys, message: PushMessage): Promise<number>;
  deleteSubscription(userId: string, endpoint: string): Promise<void>;
  now(): number;
}

export interface PushCheckReport {
  rules: number;
  circles: number;
  circlesFailed: number;
  skipped: number;
  events: number;
  sent: number;
  failed: number;
  removed: number;
  /** Alerts kept for the next check because they reached none of the user's browsers. */
  retried: number;
}

/** Run one check. Counts only in the report: no ids, addresses or flights, so it can be logged. */
export async function runPushCheck(
  state: RuleState,
  deps: PushCheckDeps,
): Promise<{ state: RuleState; report: PushCheckReport }> {
  const { subs, rules } = await deps.loadData();
  const plan = planPushCheck(rules, subs);
  const report: PushCheckReport = {
    rules: plan.rules.length,
    circles: plan.circles.length,
    circlesFailed: 0,
    skipped: plan.skipped,
    events: 0,
    sent: 0,
    failed: 0,
    removed: 0,
    retried: 0,
  };
  if (plan.rules.length === 0) {
    // Nothing to check: still drop cooldowns old enough to have no effect.
    const now = deps.now();
    const lastAlert = new Map(
      [...state.lastAlert].filter(([, at]) => now - at <= RULE_COOLDOWN_MS),
    );
    return { state: { matching: new Map(), lastAlert }, report };
  }

  const feeds = new Map<string, Aircraft[]>();
  await Promise.all(
    plan.circles.map(async (c) => {
      try {
        const r = await deps.loadFeed(c);
        if (r.error) report.circlesFailed += 1;
        else feeds.set(c.key, r.aircraft);
      } catch {
        report.circlesFailed += 1;
      }
    }),
  );

  const result = evaluatePushRules(state, plan, feeds, deps.now());
  report.events = result.events.length;
  let budget = MAX_PUSH_SENDS;
  const notDelivered: string[] = [];
  for (const [userId, messages] of messagesByUser(result.events)) {
    const targets = plan.subscriptions.get(userId) ?? [];
    const sentBefore = report.sent;
    for (const sub of targets) {
      let gone = false;
      for (const m of messages) {
        if (budget <= 0 || gone) break;
        budget -= 1;
        try {
          const status = await deps.send(sub, m);
          if (status >= 200 && status < 300) report.sent += 1;
          else {
            report.failed += 1;
            gone = isGoneStatus(status);
          }
        } catch {
          report.failed += 1;
        }
      }
      if (gone && budget > 0) {
        budget -= 1;
        try {
          await deps.deleteSubscription(userId, sub.endpoint);
          report.removed += 1;
        } catch {
          /* tried again after the next failed push */
        }
      }
    }
    if (report.sent === sentBefore) notDelivered.push(userId);
  }
  // A user whose alerts reached none of their browsers (failed, or not tried because the budget ran out) gets them
  // again next check: their matches and cooldowns are taken back, so the aircraft count as new.
  const retry = new Set(notDelivered);
  for (const e of result.events) {
    if (!retry.has(e.userId) || !e.hex) continue;
    result.state.matching.get(e.ruleId)?.delete(e.hex);
    result.state.lastAlert.delete(e.ruleId + ":" + e.hex);
    report.retried += 1;
  }
  return { state: result.state, report };
}
