import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RadarControls } from "@/hooks/use-weather-layers";
import { frameAgeLabel, RADAR_ATTRIBUTION_URL } from "@/lib/radar";

/* Radar timeline (Phase 7b): play, pause and scrub through the past frames. Shown only while radar is on. */

interface Props {
  radar: RadarControls;
  /** Current time in ms (a prop so the label can be tested). */
  now: number;
}

export function RadarTimeline({ radar, now }: Props) {
  const { frames, index } = radar;
  const frame = frames[index];
  const timeText = frame
    ? new Date(frame.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <section
      aria-label="Radar timeline"
      className="glass-panel pointer-events-auto flex w-[min(92vw,420px)] flex-col gap-1 rounded-md px-3 py-2"
    >
      {radar.error ? (
        <p className="text-sm text-muted-foreground">Radar is not available right now.</p>
      ) : radar.loading || frames.length === 0 ? (
        <p className="hud-label animate-pulse">Loading radar…</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              aria-label={radar.playing ? "Pause radar" : "Play radar"}
              onClick={() => radar.setPlaying(!radar.playing)}
              disabled={frames.length < 2}
            >
              {radar.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <input
              type="range"
              className="h-10 min-w-0 flex-1 accent-sky-400"
              aria-label="Radar frame"
              min={0}
              max={Math.max(0, frames.length - 1)}
              step={1}
              value={index}
              aria-valuetext={frame ? timeText + ", " + frameAgeLabel(frame.time, now) : undefined}
              onChange={(e) => {
                radar.setPlaying(false);
                radar.setIndex(Number(e.target.value));
              }}
            />
            <div className="w-24 shrink-0 text-right text-sm">
              <div className="data-value">{timeText}</div>
              <div className="text-[11px] text-muted-foreground">
                {frame ? frameAgeLabel(frame.time, now) : ""}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Past radar only, no forecast.{" "}
            <a
              className="underline"
              href={RADAR_ATTRIBUTION_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              Radar data: RainViewer
            </a>
          </p>
        </>
      )}
    </section>
  );
}
