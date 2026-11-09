import { useCallback, useEffect, useRef, useState } from "react";

import type { Aircraft } from "@/lib/aircraft";
import {
  canReplay,
  createRecorder,
  ingest,
  seekClock,
  startReplay,
  togglePlay,
  type ReplaySource,
  type ReplaySpeed,
} from "@/lib/replay";

/*
 * Records what the page receives and plays it back (Phase 9a). Recording is always on while the page is open
 * and costs memory only (about the last 30 minutes, bounded). The playback clock lives inside the source object
 * and is advanced by the map's animation loop; this hook only mirrors it to React a few times a second for the
 * controls, so the page does not re-render on every frame.
 */

export interface ReplayView {
  start: number;
  end: number;
  t: number;
  playing: boolean;
  speed: ReplaySpeed;
}

export interface ReplayApi {
  /** Enough has been recorded to replay. */
  available: boolean;
  /** The recording being played, or null while live. */
  source: ReplaySource | null;
  view: ReplayView | null;
  start(): void;
  stop(): void;
  toggle(): void;
  seek(t: number): void;
  setSpeed(speed: ReplaySpeed): void;
}

export function useReplay(aircraft: readonly Aircraft[], receivedAt: number | null): ReplayApi {
  const recorder = useRef(createRecorder());
  const [available, setAvailable] = useState(false);
  const [source, setSource] = useState<ReplaySource | null>(null);
  const [view, setView] = useState<ReplayView | null>(null);

  // Record every aircraft update, whatever the filters show.
  useEffect(() => {
    if (aircraft.length === 0) return;
    ingest(
      recorder.current,
      aircraft
        .filter((a) => !a.hex.startsWith("mock-"))
        .map((a) => ({
          hex: a.hex,
          callsign: a.callsign,
          registration: a.registration,
          type: a.type,
          kind: a.kind,
          kindLabel: a.kindLabel,
          squawk: a.squawk,
          lat: a.lat,
          lon: a.lon,
          altFt: a.altFt,
          track: a.track,
          gs: a.gs,
          vRate: a.vRate,
          onGround: a.onGround,
          seenPos: a.seenPos,
        })),
      receivedAt ?? Date.now(),
    );
  }, [aircraft, receivedAt]);

  // Whether a replay can start (checked now and then, not on every update).
  useEffect(() => {
    const check = () => setAvailable(canReplay(recorder.current));
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  // While replaying, copy the clock to React four times a second.
  useEffect(() => {
    if (!source) {
      setView(null);
      return;
    }
    const copy = () => {
      const c = source.clock;
      setView({ start: c.start, end: c.end, t: c.t, playing: c.playing, speed: c.speed });
    };
    copy();
    const id = setInterval(copy, 250);
    return () => clearInterval(id);
  }, [source]);

  const start = useCallback(() => setSource(startReplay(recorder.current)), []);
  const stop = useCallback(() => setSource(null), []);
  const toggle = useCallback(() => {
    if (source) togglePlay(source.clock);
  }, [source]);
  const seek = useCallback(
    (t: number) => {
      if (source) seekClock(source.clock, t);
    },
    [source],
  );
  const setSpeed = useCallback(
    (speed: ReplaySpeed) => {
      if (source) source.clock.speed = speed;
    },
    [source],
  );

  return { available, source, view, start, stop, toggle, seek, setSpeed };
}
