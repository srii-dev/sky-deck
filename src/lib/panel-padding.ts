/** Width of the desktop and tablet aircraft panel (360 px) plus its right-14 gap to the map edge. */
export const SIDE_PANEL_PX = 416;

/** Tailwind's `md` breakpoint: from here the aircraft details are a side panel, below it a bottom sheet. */
export const SIDE_PANEL_MIN_WIDTH = 768;

/** Camera padding that keeps the map centre in the visible part of the map: right of the side panel, nothing on phones. */
export function panelPadding(selected: boolean, viewportWidth: number) {
  const right = selected && viewportWidth >= SIDE_PANEL_MIN_WIDTH ? SIDE_PANEL_PX : 0;
  return { top: 0, bottom: 0, left: 0, right };
}
