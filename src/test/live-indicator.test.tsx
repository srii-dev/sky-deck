import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveIndicator } from "@/components/skydeck/LiveIndicator";

const base = {
  fetchedAt: Date.now(),
  error: null,
  isFetching: false,
  shown: 3,
  total: 3,
  source: "adsb.lol",
};

describe("LiveIndicator delay text", () => {
  it("says how far behind the picture is", () => {
    render(<LiveIndicator {...base} delaySec={8} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("8 s behind")).toBeTruthy();
  });

  it("shows no delay text before the delay is known or before the first update", () => {
    const { rerender } = render(<LiveIndicator {...base} delaySec={null} />);
    expect(screen.queryByText(/behind/)).toBeNull();
    rerender(<LiveIndicator {...base} fetchedAt={null} delaySec={8} />);
    expect(screen.queryByText(/behind/)).toBeNull();
  });

  it("does not claim to be live during a replay", () => {
    render(<LiveIndicator {...base} delaySec={8} replay />);
    expect(screen.getByText("Replay")).toBeTruthy();
    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.queryByText(/behind/)).toBeNull();
  });
});
