import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Viewport } from "@/components/skydeck/map-config";
import type { Airspace } from "@/lib/airspace";
import { getAirspace } from "@/lib/airspace.functions";
import { normalizeAirspaceBox } from "@/lib/airspace-sources";

/*
 * Airspace areas for the map (Phase 8d). Each layer only fetches while it is switched on and the view is small
 * enough (the server answers boxes of at most 6 degrees); a wider view shows a hint instead of areas.
 */

export interface AirspaceChoices {
  controlled: boolean;
  special: boolean;
}

export interface AirspaceData {
  /** Areas to draw, or null when both layers are off. */
  areas: Airspace[] | null;
  /** A layer is on but the view is too wide to load areas. */
  tooWide: boolean;
  failed: boolean;
}

const EMPTY: Airspace[] = [];

type Box = NonNullable<ReturnType<typeof normalizeAirspaceBox>>;

function useLayerQuery(layer: "class" | "special", on: boolean, box: Box | null) {
  return useQuery({
    queryKey: ["airspace", layer, box],
    queryFn: () => getAirspace({ data: { layer, ...box! } }),
    enabled: on && !!box,
    staleTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

export function useAirspace(choices: AirspaceChoices, viewport: Viewport | null): AirspaceData {
  const b = viewport?.bounds;
  const box = useMemo(
    () =>
      b
        ? normalizeAirspaceBox({ south: b.south, west: b.west, north: b.north, east: b.east })
        : null,
    [b?.south, b?.west, b?.north, b?.east], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const any = choices.controlled || choices.special;

  const controlled = useLayerQuery("class", choices.controlled, box);
  const special = useLayerQuery("special", choices.special, box);

  const areas = useMemo(() => {
    if (!any) return null;
    return [
      ...(choices.controlled ? (controlled.data?.areas ?? EMPTY) : EMPTY),
      ...(choices.special ? (special.data?.areas ?? EMPTY) : EMPTY),
    ];
  }, [any, choices.controlled, choices.special, controlled.data, special.data]);

  return {
    areas,
    tooWide: any && !!b && !box,
    failed: (choices.controlled && controlled.isError) || (choices.special && special.isError),
  };
}
