/*
 * First-run guide (Phase 22m): a short, skippable tour shown once. Whether it was seen is one
 * yes/no in this browser's storage; nothing is sent anywhere and nothing is counted.
 */
import { parseShareParams } from "./share-link";

export interface GuideStep {
  title: string;
  body: string;
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    title: "The live map",
    body: "Every arrow is a real aircraft, coloured by altitude. Drag to pan, scroll or pinch to zoom, and tilt or rotate for the 3D view (right-drag, or two fingers on a phone).",
  },
  {
    title: "Pick an aircraft",
    body: "Click or tap one to see its route, altitude, speed, vertical rate and a flight chart. Its trail builds up while you watch, and you can download it as CSV or GPX.",
  },
  {
    title: "Search and filters",
    body: "Search by callsign, registration, hex code or airport. The Filters button narrows the map by altitude, speed and category.",
  },
  {
    title: "Map tools",
    body: "The buttons on the left copy a link to this view, jump to your location, switch layers, measure distances, save views and go full screen. The gear holds settings, your saved data and keyboard shortcuts.",
  },
  {
    title: "Good to know",
    body: "Positions come from volunteer ADS-B receivers and can be delayed or missing. SkyDeck is for learning and hobby use, not for navigation or flight planning.",
  },
];

/**
 * Show the guide on its own only to a first-time visitor who did not arrive through a shared
 * link (a shared view should not be hidden behind a dialog). It can always be opened from Settings.
 */
export function shouldAutoShowGuide(seen: boolean, search: string): boolean {
  if (seen) return false;
  return Object.keys(parseShareParams(search)).length === 0;
}

/** Clamp a step index to the list. */
export function clampStep(i: number): number {
  return Math.max(0, Math.min(GUIDE_STEPS.length - 1, Math.trunc(i)));
}
