import { useQuery } from "@tanstack/react-query";

import { distanceNm, isDrawableRoute, type LatLon } from "@/lib/route-geometry";
import {
  sampleProfile,
  tileKey,
  tileUrl,
  TILE_SIZE,
  type ProfilePoint,
  type TilePixels,
  type TileRef,
} from "@/lib/terrain-profile";

/*
 * Terrain profile for a route (Phase 8b). The browser fetches the free AWS elevation tiles directly (public map
 * data, CORS open), decodes them on a canvas and keeps the decoded tiles in memory for the session.
 */

const MAX_TILES = 40;
const tileCache = new Map<string, Promise<TilePixels>>();

async function loadTileInBrowser(t: TileRef): Promise<TilePixels> {
  const key = tileKey(t);
  const hit = tileCache.get(key);
  if (hit) return hit;
  const p = (async (): Promise<TilePixels> => {
    const res = await fetch(tileUrl(t));
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  })().catch(() => {
    // Allow a later retry of a tile that failed.
    tileCache.delete(key);
    return null;
  });
  tileCache.set(key, p);
  while (tileCache.size > MAX_TILES) {
    const first = tileCache.keys().next().value;
    if (first === undefined) break;
    tileCache.delete(first);
  }
  return p;
}

export const PROFILE_SAMPLES = 60;

export interface TerrainProfile {
  points: ProfilePoint[];
  totalNm: number;
}

export function useTerrainProfile(
  origin: LatLon | null,
  destination: LatLon | null,
  enabled: boolean,
) {
  const drawable = isDrawableRoute(origin, destination);
  return useQuery<TerrainProfile>({
    queryKey: [
      "terrain-profile",
      origin && Math.round(origin.lat * 1000),
      origin && Math.round(origin.lon * 1000),
      destination && Math.round(destination.lat * 1000),
      destination && Math.round(destination.lon * 1000),
    ],
    queryFn: async () => {
      const totalNm = distanceNm(origin!, destination!);
      const points = await sampleProfile(
        origin!,
        destination!,
        totalNm,
        PROFILE_SAMPLES,
        loadTileInBrowser,
      );
      return { points, totalNm };
    },
    enabled: enabled && drawable,
    staleTime: Infinity,
    retry: 0,
  });
}
