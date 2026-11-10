import { Pause, Play, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReplayApi } from "@/hooks/use-replay";
import { offsetLabel, REPLAY_SPEEDS } from "@/lib/replay";

/*
 * Replay controls (Phase 9a): play, pause, scrub and speed, and a way back to live. The recording is only what
 * this page received while it was open, so the bar says so.
 */

export function ReplayBar({ replay }: { replay: ReplayApi }) {
  const v = replay.view;
  if (!v) return null;
  const span = Math.max(1, v.end - v.start);
  const clock = new Date(v.t).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <section
      aria-label="Replay"
      className="glass-panel pointer-events-auto flex w-[min(92vw,460px)] max-w-full flex-col gap-1 rounded-md px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="rounded border border-amber-500/60 bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          Replay
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          aria-label={v.playing ? "Pause replay" : "Play replay"}
          onClick={replay.toggle}
        >
          {v.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <input
          type="range"
          className="h-10 min-w-0 flex-1 accent-amber-400"
          aria-label="Replay position"
          min={0}
          max={span}
          step={1000}
          value={Math.min(span, Math.max(0, v.t - v.start))}
          aria-valuetext={clock + ", " + offsetLabel(v)}
          onChange={(e) => replay.seek(v.start + Number(e.target.value))}
        />
        <div className="w-20 shrink-0 text-right text-sm">
          <div className="data-value">{clock}</div>
          <div className="text-[11px] text-muted-foreground">{offsetLabel(v)}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Replay speed">
          {REPLAY_SPEEDS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={v.speed === s ? "default" : "outline"}
              className="h-8 px-2"
              aria-pressed={v.speed === s}
              onClick={() => replay.setSpeed(s)}
            >
              {s}×
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={replay.stop}>
          <Radio /> Back to live
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Only what this page saw while it was open, in the area it showed. Not stored or sent
        anywhere.
      </p>
    </section>
  );
}
