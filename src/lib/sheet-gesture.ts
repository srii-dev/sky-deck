/*
 * Bottom-sheet swipe (Phase 22n): a swipe on the sheet's handle opens or closes the details, a
 * short touch is a tap. Pure, so the thresholds are tested. Positive dy means the finger moved down.
 */

export type SheetGesture = "expand" | "collapse" | "tap";

/** Finger travel (px) that counts as a swipe rather than a tap. */
export const SWIPE_MIN_PX = 24;

export function sheetGesture(startY: number, endY: number): SheetGesture {
  const dy = endY - startY;
  if (!Number.isFinite(dy) || Math.abs(dy) < SWIPE_MIN_PX) return "tap";
  return dy < 0 ? "expand" : "collapse";
}
