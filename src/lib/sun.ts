/*
 * Day and night (Phase 24d): where the sun is overhead, the line between day and night, and sunrise and sunset for a
 * place. The formulas are the usual low-precision solar ones (accurate to about a minute for sunrise and a few hundredths
 * of a degree for the terminator), which is plenty for shading a map. Pure functions, dates in and out.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const norm180 = (d: number) => ((d + 540) % 360) - 180;

export interface SunPosition {
  /** Degrees north of the equator where the sun is overhead (the declination). */
  declinationDeg: number;
  /** Degrees east where the sun is overhead, -180 to 180. */
  subsolarLonDeg: number;
  /** Equation of time in minutes (apparent solar time minus mean solar time). */
  equationOfTimeMin: number;
}

/** Days since 2000-01-01 12:00 UTC (J2000), with fractions. */
function daysSinceJ2000(date: Date): number {
  return date.getTime() / 86_400_000 - 10_957.5;
}

export function sunPosition(date: Date): SunPosition {
  const n = daysSinceJ2000(date);
  const L = norm360(280.46 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = norm360(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * DEG);
  const gmst = norm360(280.46061837 + 360.98564736629 * n);
  return {
    declinationDeg: dec * DEG,
    subsolarLonDeg: norm180(ra - gmst),
    equationOfTimeMin: 4 * norm180(L - ra),
  };
}

export interface SunTimes {
  /** Null when the sun does not rise or set that day (see `polar`). */
  sunrise: Date | null;
  sunset: Date | null;
  /** The sun stays up ("day") or down ("night") the whole day. */
  polar: "day" | "night" | null;
  /** When the sun is highest, in UTC. */
  solarNoon: Date;
}

/**
 * Sunrise and sunset for the solar day around the date's UTC noon at this longitude, so for New York on 21 June the
 * sunrise is that morning and the sunset is just after midnight UTC the next day. The sun's upper edge crossing the
 * horizon, with the usual refraction allowance (-0.833 degrees).
 */
export function sunTimes(date: Date, latDeg: number, lonDeg: number): SunTimes {
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  // Solar noon estimate, refined once with the sun's position at that time.
  let noonMs = dayStart + (12 - lonDeg / 15) * 3_600_000;
  for (let i = 0; i < 2; i++) {
    const eot = sunPosition(new Date(noonMs)).equationOfTimeMin;
    noonMs = dayStart + (12 - lonDeg / 15 - eot / 60) * 3_600_000;
  }
  const solarNoon = new Date(noonMs);
  const dec = sunPosition(solarNoon).declinationDeg * RAD;
  const lat = latDeg * RAD;
  const cosH =
    (Math.sin(-0.833 * RAD) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (cosH > 1) return { sunrise: null, sunset: null, polar: "night", solarNoon };
  if (cosH < -1) return { sunrise: null, sunset: null, polar: "day", solarNoon };
  const halfDayMs = (Math.acos(cosH) * DEG * 4 * 60_000) / 1; // degrees of hour angle to ms: 1 deg = 4 minutes
  return {
    sunrise: new Date(noonMs - halfDayMs),
    sunset: new Date(noonMs + halfDayMs),
    polar: null,
    solarNoon,
  };
}

/**
 * The night side of the earth as a polygon ring of [lon, lat] points: the day and night line from west to east, closed
 * through the pole that is in darkness. `stepDeg` is the longitude spacing of the line.
 */
export function nightRing(date: Date, stepDeg = 2): [number, number][] {
  const { declinationDeg, subsolarLonDeg } = sunPosition(date);
  // Exactly on an equinox the line is a meridian; a tiny declination keeps the formula finite.
  const dec = (Math.abs(declinationDeg) < 1e-6 ? 1e-6 : declinationDeg) * RAD;
  const nightPoleLat = declinationDeg >= 0 ? -90 : 90;
  const ring: [number, number][] = [[-180, nightPoleLat]];
  for (let lon = -180; lon <= 180 + 1e-9; lon += stepDeg) {
    const H = (lon - subsolarLonDeg) * RAD;
    ring.push([Math.min(180, lon), Math.atan(-Math.cos(H) / Math.tan(dec)) * DEG]);
  }
  ring.push([180, nightPoleLat], [-180, nightPoleLat]);
  return ring;
}

/** True when the point is on the dark side of the day and night line. */
export function isNight(date: Date, latDeg: number, lonDeg: number): boolean {
  const { declinationDeg, subsolarLonDeg } = sunPosition(date);
  const lat = latDeg * RAD;
  const dec = declinationDeg * RAD;
  const H = (lonDeg - subsolarLonDeg) * RAD;
  // The sine of the sun's height above the horizon: negative is night.
  return Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H) < 0;
}
