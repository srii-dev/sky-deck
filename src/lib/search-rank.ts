/*
 * Search ranking for the live aircraft list (Phase 22g): callsign, registration, hex, airline name
 * and aircraft type, best match first. Also the recent-search list kept in this browser.
 */

import type { Aircraft } from "./aircraft";

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Lower is better; null when the aircraft does not match.
 * `q` is the query without punctuation (for identifiers); `raw` keeps spaces (for names).
 */
function score(q: string, raw: string, a: Aircraft): number | null {
  const callsign = norm(a.callsign);
  const reg = norm(a.registration);
  const hex = a.hex.toUpperCase();
  const type = norm(a.type);
  const operator = (a.operator ?? "").toUpperCase();
  const description = (a.description ?? "").toUpperCase();

  if (callsign === q || reg === q || hex === q) return 0;
  if (callsign.startsWith(q)) return 1;
  if (reg.startsWith(q)) return 2;
  if (hex.startsWith(q)) return 3;
  if (type === q) return 4;
  if (type.startsWith(q)) return 5;
  if (operator.split(" ").some((w) => w.startsWith(raw))) return 6;
  if (operator.includes(raw)) return 7;
  if (callsign.includes(q) || reg.includes(q)) return 8;
  if (description.includes(raw)) return 9;
  return null;
}

/** The aircraft matching `query` (at least 2 characters), best first, at most `limit`. */
export function rankAircraft(query: string, list: Aircraft[], limit = 6): Aircraft[] {
  const raw = query.trim().toUpperCase().split(" ").filter(Boolean).join(" ");
  const q = norm(raw);
  if (raw.length < 2 || q.length < 1) return [];
  const scored: { a: Aircraft; s: number }[] = [];
  for (const a of list) {
    const s = score(q, raw, a);
    if (s != null) scored.push({ a, s });
  }
  scored.sort(
    (x, y) => x.s - y.s || (x.a.callsign ?? x.a.hex).localeCompare(y.a.callsign ?? y.a.hex),
  );
  return scored.slice(0, limit).map((x) => x.a);
}

export const RECENT_SEARCHES_KEY = "skydeck:recent-searches";
export const MAX_RECENT = 5;

/** Put `term` first, drop duplicates (ignoring case), keep at most MAX_RECENT. */
export function addRecent(list: string[], term: string): string[] {
  const t = term.replace(/\s+/g, " ").trim().slice(0, 40);
  if (t.length < 2) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
}

export function loadRecent(): string[] {
  try {
    const text =
      typeof localStorage === "undefined" ? null : localStorage.getItem(RECENT_SEARCHES_KEY);
    const raw: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function storeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
