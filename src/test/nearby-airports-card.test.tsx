import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NearbyAirports } from "@/components/skydeck/NearbyAirports";
import type { Airport } from "@/lib/airports";
import { locate } from "@/lib/geolocate";
import { nearbyAirports } from "@/lib/nearby-airports";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* The positions below are made up. Nothing here asks a real browser for its location. */
const LIST: Airport[] = [
  {
    iata: "JFK",
    icao: "KJFK",
    name: "John F. Kennedy Intl",
    city: "New York",
    lat: 40.64,
    lon: -73.78,
  },
  { iata: "LGA", icao: "KLGA", name: "LaGuardia", city: "New York", lat: 40.78, lon: -73.87 },
  {
    iata: "LAX",
    icao: "KLAX",
    name: "Los Angeles Intl",
    city: "Los Angeles",
    lat: 33.94,
    lon: -118.41,
  },
];
const FROM_QUEENS = { lat: 40.7, lon: -73.8 };

describe("nearby airports card", () => {
  it("lists the airports found from a position, nearest first, with distances", () => {
    const items = nearbyAirports(FROM_QUEENS, LIST);
    render(<NearbyAirports items={items} units="aviation" onPick={vi.fn()} onClose={vi.fn()} />);
    const rows = screen.getAllByRole("button", { name: /Kennedy|LaGuardia/ });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("JFK");
    expect(rows[0]?.textContent).toMatch(/\d+\.\d nm/);
    expect(screen.queryByText(/Los Angeles Intl/)).toBeNull();
  });

  it("shows distances in the chosen unit system", () => {
    const items = nearbyAirports(FROM_QUEENS, LIST);
    render(<NearbyAirports items={items} units="metric" onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /Kennedy/ })[0]?.textContent).toMatch(/\d+ km/);
  });

  it("passes the picked airport to the caller", () => {
    const onPick = vi.fn();
    const items = nearbyAirports(FROM_QUEENS, LIST);
    render(<NearbyAirports items={items} units="aviation" onPick={onPick} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /LaGuardia/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ icao: "KLGA" });
  });

  it("can be closed", () => {
    const onClose = vi.fn();
    render(<NearbyAirports items={[]} units="aviation" onPick={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close nearby airports" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says so when no airport is within range", () => {
    const items = nearbyAirports({ lat: 0, lon: 0 }, LIST);
    render(<NearbyAirports items={items} units="aviation" onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/No airports in the list within 150 nm/)).toBeTruthy();
  });
});

describe("locate (geolocation faked)", () => {
  it("resolves a position from the browser's answer", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (
          ok: (p: { coords: { latitude: number; longitude: number } }) => void,
        ) => ok({ coords: { latitude: 40.7, longitude: -73.8 } }),
      },
    });
    await expect(locate()).resolves.toEqual({ lat: 40.7, lon: -73.8 });
  });

  it("turns a denied permission into a readable message", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, err: (e: { code: number }) => void) => err({ code: 1 }),
      },
    });
    await expect(locate()).rejects.toThrow(/blocked/);
  });

  it("rejects when the browser has no geolocation", async () => {
    vi.stubGlobal("navigator", {});
    await expect(locate()).rejects.toThrow(/does not support/);
  });
});
