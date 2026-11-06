import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

// The page only uses Link for a "back" link; render it as a plain anchor so no router is needed.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  };
});

import { Route } from "@/routes/inspector";

afterEach(cleanup);

function renderPage() {
  const Page = Route.options.component as () => React.JSX.Element;
  return render(<Page />);
}

describe("inspector route", () => {
  it("is registered and matches /inspector instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/inspector").at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

describe("inspector page", () => {
  it("starts empty", () => {
    renderPage();
    expect(screen.getByText("No frames yet.")).toBeTruthy();
  });

  it("decodes the example frames, including a paired position", () => {
    renderPage();
    fireEvent.click(screen.getByText("Load example frames"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("KLM1023");
    expect(text).toContain("38,000 ft");
    expect(text).toMatch(/52\.257\d*, 3\.91\d*/);
    expect(text).toContain("159 kt");
    expect(screen.getAllByText("CRC OK")).toHaveLength(4);
  });

  it("shows an error for a bad line and a mismatch for a corrupted frame", () => {
    renderPage();
    const box = screen.getByLabelText("Raw frames");
    fireEvent.change(box, {
      target: { value: "not a frame\n8D4840D6202CC371C32CE0576099" },
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Not hexadecimal");
    expect(screen.getByText("CRC mismatch")).toBeTruthy();
  });

  it("clears the input", () => {
    renderPage();
    fireEvent.click(screen.getByText("Load example frames"));
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("No frames yet.")).toBeTruthy();
  });
});
