import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Viewport } from "@/components/skydeck/map-config";
import { useAirspace } from "@/hooks/use-airspace";

vi.mock("@/lib/airspace.functions", () => ({
  getAirspace: vi.fn(async () => ({ areas: [{ id: "a1" }], truncated: false })),
}));

const view = (span: number): Viewport =>
  ({
    lat: 40.7,
    lon: -73.9,
    zoom: 8,
    bounds: { south: 40.5, north: 40.5 + span, west: -74.2, east: -74.2 + span },
  }) as Viewport;

describe("useAirspace", () => {
  it("clears the areas once the view is too wide to load, instead of keeping the last ones", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ v }: { v: Viewport }) => useAirspace({ controlled: true, special: false }, v),
      { wrapper, initialProps: { v: view(1) } },
    );
    await waitFor(() => expect(result.current.areas).toHaveLength(1));

    rerender({ v: view(20) });
    expect(result.current.tooWide).toBe(true);
    expect(result.current.areas).toEqual([]);
  });
});
