import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreditsButton, CreditsDialog } from "@/components/skydeck/CreditsDialog";
import { CREDITS, CREDITS_DISCLAIMER } from "@/lib/credits";

afterEach(cleanup);

describe("CreditsDialog", () => {
  it("renders nothing while closed", () => {
    render(<CreditsDialog open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText("Credits and data sources")).toBeNull();
  });

  it("lists every source with its credit text, groups and disclaimer", () => {
    render(<CreditsDialog open onOpenChange={() => {}} />);
    expect(screen.getByText("Credits and data sources")).toBeTruthy();
    for (const c of CREDITS) {
      // A name can also appear as a link label (for example adsb.lol), so allow more than one match.
      expect(screen.getAllByText(c.name).length).toBeGreaterThan(0);
      expect(screen.getByText(c.credit)).toBeTruthy();
    }
    expect(screen.getByText("Aircraft and flight data")).toBeTruthy();
    expect(screen.getByText("Map")).toBeTruthy();
    expect(screen.getByText("Fonts")).toBeTruthy();
    expect(screen.getByText(CREDITS_DISCLAIMER)).toBeTruthy();
  });

  it("opens every link in a new tab without leaking the opener", () => {
    render(<CreditsDialog open onOpenChange={() => {}} />);
    const expected = CREDITS.flatMap((c) => c.links).length;
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(expected);
    for (const a of links) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("asks to close when the close button is pressed", () => {
    const onOpenChange = vi.fn();
    render(<CreditsDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("CreditsButton", () => {
  it("opens the dialog when pressed", () => {
    render(<CreditsButton />);
    expect(screen.queryByText("Credits and data sources", { selector: "h2" })).toBeNull();
    fireEvent.click(screen.getByText("Credits and data sources"));
    expect(screen.getByText("Credits and data sources", { selector: "h2" })).toBeTruthy();
    expect(screen.getAllByText("adsb.lol").length).toBeGreaterThan(0);
  });
});
