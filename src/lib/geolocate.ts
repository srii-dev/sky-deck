/*
 * "My location" (Phase 22c). The browser asks the user for permission; the position is used only to
 * move the map, is never sent anywhere and is not stored.
 */

export interface Position {
  lat: number;
  lon: number;
}

/** A short message for a geolocation error code (1 denied, 2 unavailable, 3 timeout). */
export function locationErrorMessage(code: number | undefined): string {
  switch (code) {
    case 1:
      return "Location is blocked. Allow it for this site in your browser to use this button.";
    case 2:
      return "Your location is not available right now.";
    case 3:
      return "Finding your location took too long. Try again.";
    default:
      return "Could not get your location.";
  }
}

export const SYSTEM_BLOCKED_MESSAGE =
  "This site is allowed, but your device has location turned off for the browser. Turn it on in your system settings (Windows: Settings, Privacy and security, Location; Mac: System Settings, Privacy and Security, Location Services), then try again.";

/** True when the browser says this site may use location, so a refusal came from the operating system. */
async function systemBlocked(): Promise<boolean> {
  try {
    const s = await navigator.permissions?.query({ name: "geolocation" });
    return s?.state === "granted";
  } catch {
    return false;
  }
}

export function locate(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Your browser does not support location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => {
        if (e.code !== 1) return reject(new Error(locationErrorMessage(e.code)));
        // Allowed for the site but still refused: the device has location switched off for the browser.
        void systemBlocked().then((os) =>
          reject(new Error(os ? SYSTEM_BLOCKED_MESSAGE : locationErrorMessage(1))),
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
