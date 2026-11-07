import { useSyncExternalStore } from "react";
import { browserFlags, serverFlags, type FlagName } from "@/lib/flags";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Whether a feature flag is on. Server render and first client render use the build-time value,
 * so hydration matches; a tester's stored value applies right after.
 */
export function useFlag(name: FlagName): boolean {
  return useSyncExternalStore(
    subscribe,
    () => browserFlags()[name],
    () => serverFlags()[name],
  );
}
