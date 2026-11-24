import { describe, expect, it } from "vitest";
import { panelPadding, SIDE_PANEL_PX } from "@/lib/panel-padding";

describe("panelPadding", () => {
  it("leaves room for the side panel on tablets and desktops when an aircraft is selected", () => {
    expect(panelPadding(true, 768).right).toBe(SIDE_PANEL_PX);
    expect(panelPadding(true, 1440).right).toBe(SIDE_PANEL_PX);
  });
  it("adds nothing on phones (bottom sheet) or without a selection", () => {
    expect(panelPadding(true, 767).right).toBe(0);
    expect(panelPadding(false, 1440).right).toBe(0);
  });
});
