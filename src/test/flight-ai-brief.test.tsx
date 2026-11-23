import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const explainFlight = vi.fn();
vi.mock("@/lib/flight-ai.functions", () => ({
  explainFlight: (...a: unknown[]) => explainFlight(...a),
}));

import { FlightAiBrief } from "@/components/skydeck/FlightAiBrief";

/* The server function is mocked, so no AI provider is called. */
afterEach(() => {
  cleanup();
  explainFlight.mockReset();
});

describe("FlightAiBrief", () => {
  it("sends nothing until asked, then shows the labelled answer", async () => {
    explainFlight.mockResolvedValue({ ok: true, text: "It is cruising east.", provider: "x" });
    render(<FlightAiBrief hex="abc123" facts="Callsign: TST123" />);
    expect(explainFlight).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Explain with AI" }));
    expect(explainFlight).toHaveBeenCalledWith({ data: { facts: "Callsign: TST123" } });
    expect(await screen.findByText("It is cruising east.")).toBeTruthy();
    expect(screen.getByText(/AI-generated/)).toBeTruthy();
    expect(screen.getByText(/can be wrong/)).toBeTruthy();
  });

  it("keeps the answer while the facts update, resets for another aircraft", async () => {
    explainFlight.mockResolvedValue({ ok: true, text: "It is cruising east.", provider: "x" });
    const { rerender } = render(<FlightAiBrief hex="abc123" facts="Altitude: 36,000 ft" />);
    fireEvent.click(screen.getByRole("button", { name: "Explain with AI" }));
    await screen.findByText("It is cruising east.");
    rerender(<FlightAiBrief hex="abc123" facts="Altitude: 36,100 ft" />);
    expect(screen.getByText("It is cruising east.")).toBeTruthy();
    rerender(<FlightAiBrief hex="def456" facts="Altitude: 2,000 ft" />);
    expect(screen.queryByText("It is cruising east.")).toBeNull();
    expect(screen.getByRole("button", { name: "Explain with AI" })).toBeTruthy();
  });

  it("shows the failure message", async () => {
    explainFlight.mockResolvedValue({ ok: false, error: "Too many AI requests. Wait a moment." });
    render(<FlightAiBrief hex="abc123" facts="Callsign: TST123" />);
    fireEvent.click(screen.getByRole("button", { name: "Explain with AI" }));
    expect(await screen.findByText("Too many AI requests. Wait a moment.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explain with AI" })).toBeTruthy();
  });
});
