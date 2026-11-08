import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { NO_WEATHER, type WeatherMapState } from "@/components/skydeck/weather-layers";
import type { Viewport } from "@/components/skydeck/map-config";
import {
  nextFrameIndex,
  parseRadarIndex,
  radarTileUrl,
  RADAR_FRAME_MS,
  RADAR_INDEX_URL,
  RADAR_LOOP_PAUSE_MS,
  RADAR_REFRESH_MS,
  reselectFrame,
  type RadarFrame,
} from "@/lib/radar";
import { getAdvisories, getPireps } from "@/lib/weather.functions";
import { normalizeBox } from "@/lib/weather-sources";
import type { Advisory, Pirep } from "@/lib/weather-advisories";

/*
 * Data and playback for the weather layers (Phase 7). Each layer only fetches while it is switched on.
 * Radar frames are fetched by the browser straight from RainViewer (public tiles, CORS open); advisories and
 * pilot reports go through the server proxy.
 */

export interface WeatherChoices {
  radar: boolean;
  echoTops: boolean;
  advisories: boolean;
  pireps: boolean;
}

export interface RadarControls {
  frames: RadarFrame[];
  index: number;
  setIndex: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  loading: boolean;
  error: boolean;
}

export interface WeatherLayers {
  state: WeatherMapState;
  radar: RadarControls;
  advisories: Advisory[];
  pireps: Pirep[];
  advisoryFailed: boolean;
  pirepFailed: boolean;
}

async function fetchRadarIndex() {
  const res = await fetch(RADAR_INDEX_URL);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const index = parseRadarIndex(await res.json());
  if (!index) throw new Error("No radar frames");
  return index;
}

const EMPTY_FRAMES: RadarFrame[] = [];
const EMPTY_ADVISORIES: Advisory[] = [];
const EMPTY_PIREPS: Pirep[] = [];

export function useWeatherLayers(
  choices: WeatherChoices,
  viewport: Viewport | null,
): WeatherLayers {
  const radarQuery = useQuery({
    queryKey: ["radar-index"],
    queryFn: fetchRadarIndex,
    enabled: choices.radar,
    staleTime: RADAR_REFRESH_MS,
    refetchInterval: RADAR_REFRESH_MS,
    retry: 1,
  });
  const frames = radarQuery.data?.frames ?? EMPTY_FRAMES;

  const [index, setIndexState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const framesRef = useRef<RadarFrame[]>(EMPTY_FRAMES);
  // Start on the newest frame, and keep the chosen frame when the list refreshes.
  useEffect(() => {
    // Read the old list before replacing it: the state updater below runs later.
    const previous = framesRef.current;
    framesRef.current = frames;
    setIndexState((i) => reselectFrame(previous, i, frames));
  }, [frames]);

  // Playback: step through the frames, pausing a moment on the newest one.
  useEffect(() => {
    if (!choices.radar || !playing || frames.length < 2) return;
    const atEnd = index >= frames.length - 1;
    const t = setTimeout(
      () => setIndexState((i) => nextFrameIndex(i, frames.length)),
      atEnd ? RADAR_LOOP_PAUSE_MS : RADAR_FRAME_MS,
    );
    return () => clearTimeout(t);
  }, [choices.radar, playing, index, frames.length]);

  // Turning radar off stops playback.
  useEffect(() => {
    if (!choices.radar) setPlaying(false);
  }, [choices.radar]);

  const advisoryQuery = useQuery({
    queryKey: ["weather-advisories"],
    queryFn: () => getAdvisories(),
    enabled: choices.advisories,
    staleTime: 4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const b = viewport?.bounds;
  const box = useMemo(
    () => (b ? normalizeBox({ south: b.south, west: b.west, north: b.north, east: b.east }) : null),
    [b?.south, b?.west, b?.north, b?.east], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pirepQuery = useQuery({
    queryKey: ["weather-pireps", box],
    queryFn: () => getPireps({ data: box! }),
    enabled: choices.pireps && !!box,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const advisories = advisoryQuery.data?.advisories ?? EMPTY_ADVISORIES;
  const pireps = pirepQuery.data?.pireps ?? EMPTY_PIREPS;

  const frame = frames[Math.min(index, Math.max(0, frames.length - 1))];
  const radarUrl =
    choices.radar && radarQuery.data && frame ? radarTileUrl(radarQuery.data, frame) : null;

  const state = useMemo<WeatherMapState>(
    () => ({
      ...NO_WEATHER,
      radarUrl,
      echoTops: choices.echoTops,
      advisories: choices.advisories ? advisories : null,
      pireps: choices.pireps ? pireps : null,
    }),
    [radarUrl, choices.echoTops, choices.advisories, choices.pireps, advisories, pireps],
  );

  return {
    state,
    radar: {
      frames,
      index: Math.min(index, Math.max(0, frames.length - 1)),
      setIndex: setIndexState,
      playing,
      setPlaying,
      loading: choices.radar && radarQuery.isPending,
      error: choices.radar && radarQuery.isError,
    },
    advisories,
    pireps,
    advisoryFailed:
      choices.advisories && (advisoryQuery.isError || (advisoryQuery.data?.failed.length ?? 0) > 0),
    pirepFailed: choices.pireps && pirepQuery.isError,
  };
}
