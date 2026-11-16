/*
 * Small pure helpers for what the live view tells the visitor about time (Phase 20d, 20g, 20j): how far behind the
 * picture is, and how long ago a missing aircraft was last heard. Everything here is a difference of two durations
 * (the drawn delay, the age of the newest report), so the browser clock never has to agree with a server clock:
 * a clock that is minutes wrong changes none of these numbers.
 */
import type { MotionState } from "./smooth-motion";

/** An aircraft is called "last seen" only after it has been silent this long past its newest report. */
export const LAST_SEEN_MIN_MS = 5000;

/** Whole seconds since the newest report of an aircraft that has stopped reporting, or null while it is reporting. */
export function lastSeenSec(
  m: Pick<MotionState, "phase" | "beyondNewestMs"> | null | undefined,
): number | null {
  if (!m) return null;
  if (m.phase !== "extrapolated" && m.phase !== "stale") return null;
  if (!(m.beyondNewestMs >= LAST_SEEN_MIN_MS)) return null;
  return Math.floor(m.beyondNewestMs / 1000);
}

/** "Last seen 34 s ago" or "Last seen 2 min ago". */
export function formatLastSeen(sec: number): string {
  return sec < 90 ? `Last seen ${sec} s ago` : `Last seen ${Math.round(sec / 60)} min ago`;
}

/** The delay text for the status chip: "8 s behind", or null before the delay is known or during a replay. */
export function formatBehind(delaySec: number | null | undefined, replay: boolean): string | null {
  if (replay || delaySec == null || !Number.isFinite(delaySec)) return null;
  return `${Math.round(delaySec)} s behind`;
}

export interface DebugInput {
  delaySec: number | null;
  smooth: boolean;
  shown: number;
  total: number;
  feedAgeSec: number | null;
  pollSec: number;
  failed: boolean;
  selected: Pick<MotionState, "phase" | "beyondNewestMs"> | null;
}

/** The lines of the debug overlay (labs flag), as label and value pairs. */
export function debugLines(d: DebugInput): [string, string][] {
  return [
    [
      "Delay",
      d.delaySec == null
        ? "not yet known"
        : `${Math.round(d.delaySec)} s, ${d.smooth ? "Smooth" : "Live"} mode`,
    ],
    ["Aircraft", d.shown === d.total ? String(d.total) : `${d.shown} shown of ${d.total}`],
    [
      "Last update",
      d.feedAgeSec == null ? "none yet" : `${d.feedAgeSec} s ago${d.failed ? " (failed)" : ""}`,
    ],
    ["Poll every", `${d.pollSec} s`],
    [
      "Selected",
      d.selected
        ? `${d.selected.phase}, ${Math.round(Math.max(0, d.selected.beyondNewestMs) / 1000)} s past newest report`
        : "none",
    ],
  ];
}
