/*
 * Screen-space declutter for zoomed-out views: keep one plane per small screen cell, so planes that sit on top of
 * each other are thinned out while every free spot on the screen is still filled. Pure; the map passes in
 * projected pixel positions.
 */

export interface DeclutterItem {
  key: string;
  x: number;
  y: number;
  /** Higher wins a shared cell. */
  priority: number;
}

/**
 * Keys of the items to draw. A cell smaller than an icon lets icons touch a little, which keeps far more planes
 * than icon-box collision would. Items shown last time get a bonus, so planes do not flicker at cell edges.
 */
export function declutter(
  items: readonly DeclutterItem[],
  cellPx: number,
  shownBefore: ReadonlySet<string>,
): Set<string> {
  const best = new Map<string, DeclutterItem & { score: number }>();
  for (const it of items) {
    const cell = Math.floor(it.x / cellPx) + ":" + Math.floor(it.y / cellPx);
    const score = it.priority + (shownBefore.has(it.key) ? 0.5 : 0);
    const cur = best.get(cell);
    if (!cur || score > cur.score) best.set(cell, { ...it, score });
  }
  const out = new Set<string>();
  for (const it of best.values()) out.add(it.key);
  return out;
}
