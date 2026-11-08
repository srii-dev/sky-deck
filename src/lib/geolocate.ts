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

export function locate(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Your browser does not support location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(locationErrorMessage(e.code))),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
