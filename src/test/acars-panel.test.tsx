import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ACARS_DISCLOSURE, AcarsMessages } from "@/components/skydeck/AcarsMessages";
import type { AcarsMessage } from "@/lib/acars-messages";
import type { AcarsFetchResult } from "@/lib/airframes-client";

afterEach(cleanup);

/* All messages here are INVENTED. The loader is injected, so no network request is made. */
const msg = (over: Partial<AcarsMessage> = {}): AcarsMessage => ({
  id: 1,
  time: Date.parse("2026-01-02T03:04:05Z"),
  tail: "N000XX",
  flight: "TST123",
  label: "H1",
  fromHex: null,
  toHex: null,
  frequency: 131.55,
  sourceType: "acars",
  departing: "KAAA",
  destination: "KBBB",
  text: "TEST MESSAGE ONE",
  ...over,
});
const ok = (messages: AcarsMessage[]): AcarsFetchResult => ({
  ok: true,
  messages,
  fetchedAt: 0,
  cached: false,
});

describe("AcarsMessages", () => {
  it("renders nothing for an identifier that is not an ICAO hex (such as a mock aircraft)", () => {
    const { container } = render(<AcarsMessages hex="mock-1" load={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("discloses the direct request and loads nothing until the button is pressed", async () => {
    const load = vi.fn(async () => ok([msg()]));
    render(<AcarsMessages hex="abc123" load={load} />);
    expect(screen.getByText(ACARS_DISCLOSURE)).toBeTruthy();
    expect(load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Load ACARS messages"));
    expect(await screen.findByText("TEST MESSAGE ONE")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("abc123");
    expect(document.body.textContent).toContain("label H1");
    expect(document.body.textContent).toContain("131.55 MHz");
    expect(document.body.textContent).toContain("KAAA -> KBBB");
    expect(screen.getByText("Refresh")).toBeTruthy();
  });

  it("shows a loading state while the request is running", async () => {
    let finish!: (r: AcarsFetchResult) => void;
    const load = vi.fn(() => new Promise<AcarsFetchResult>((resolve) => (finish = resolve)));
    render(<AcarsMessages hex="abc123" load={load} />);
    fireEvent.click(screen.getByText("Load ACARS messages"));
    const busy = screen.getByText("Loading...") as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    finish(ok([]));
    expect(await screen.findByText(/No ACARS messages heard/)).toBeTruthy();
  });

  it("renders message text as plain text, never as markup", async () => {
    const hostile = '<b id="injected">bold</b><img src=x onerror=alert(1)>';
    render(<AcarsMessages hex="abc123" load={async () => ok([msg({ text: hostile })])} />);
    fireEvent.click(screen.getByText("Load ACARS messages"));
    expect(await screen.findByText(hostile)).toBeTruthy();
    expect(document.querySelector("#injected")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows an empty state, an error with a retry button, and the attribution link", async () => {
    const results: AcarsFetchResult[] = [
      ok([]),
      { ok: false, error: "Airframes is limiting requests. Try again in 7 s." },
    ];
    const load = vi.fn(async () => results.shift()!);
    render(<AcarsMessages hex="abc123" load={load} />);

    fireEvent.click(screen.getByText("Load ACARS messages"));
    expect(await screen.findByText(/No ACARS messages heard/)).toBeTruthy();

    fireEvent.click(screen.getByText("Refresh"));
    expect(await screen.findByText(/limiting requests/)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();

    const link = screen.getByText("Data provided by Airframes.io and its community of feeders");
    expect(link.getAttribute("href")).toBe("https://airframes.io");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("handles a message with no text", async () => {
    render(<AcarsMessages hex="abc123" load={async () => ok([msg({ text: "" })])} />);
    fireEvent.click(screen.getByText("Load ACARS messages"));
    expect(await screen.findByText("(no text)")).toBeTruthy();
  });
});

describe("AcarsMessages original and explanation", () => {
  it("labels the original text, copies it exactly, and explains abbreviations by rules", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const load = vi.fn(async () => ok([msg({ text: "TEST ETA 1234 RWY 99\nLINE TWO" })]));
    render(<AcarsMessages hex="abc123" load={load} />);
    fireEvent.click(screen.getByText("Load ACARS messages"));
    expect(await screen.findByText("Original received message")).toBeTruthy();
    fireEvent.click(screen.getByText("Copy"));
    expect(writeText).toHaveBeenCalledWith("TEST ETA 1234 RWY 99\nLINE TWO");
    expect(await screen.findByText("Copied")).toBeTruthy();
    // The explanation sits in a closed details element and names its method.
    expect(screen.getByText("Explain this message")).toBeTruthy();
    expect(document.body.textContent).toContain("estimated time of arrival");
    expect(document.body.textContent).toContain("runway");
    expect(document.body.textContent).toContain("Explained by SkyDeck rules, not by AI");
    expect(document.body.textContent).toContain("Label codes are not explained");
  });

  it("marks missing metadata unavailable and a message without text as partial", async () => {
    const load = vi.fn(async () => ok([msg({ text: "", tail: null, frequency: null })]));
    render(<AcarsMessages hex="abc123" load={load} />);
    fireEvent.click(screen.getByText("Load ACARS messages"));
    expect(await screen.findByText("(no text)")).toBeTruthy();
    expect(screen.queryByText("Original received message")).toBeNull();
    expect(screen.getByText("Explain this message (partial)")).toBeTruthy();
    expect(document.body.textContent).toContain("unavailable");
    expect(document.body.textContent).toContain("This message has no text.");
  });

  it("says copying was blocked when the browser refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("no")) },
      configurable: true,
    });
    render(<AcarsMessages hex="abc123" load={vi.fn(async () => ok([msg()]))} />);
    fireEvent.click(screen.getByText("Load ACARS messages"));
    fireEvent.click(await screen.findByText("Copy"));
    expect(await screen.findByText("Copy blocked")).toBeTruthy();
  });
});
