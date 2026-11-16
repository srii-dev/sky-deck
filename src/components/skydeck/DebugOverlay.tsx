import { useEffect, useState } from "react";

import { useFlag } from "@/hooks/use-flag";
import { debugLines, type DebugInput } from "@/lib/live-status";

/*
 * A small read-only box with the numbers behind the live view (Phase 20j). Only when the "labs" flag is on (a tester
 * adds "labs" to the browser storage key described in flags.ts). It renders nothing at all otherwise, takes no pointer
 * events, does not move the layout, and has no animation. The buffer length of each aircraft lives inside the map and
 * is not shown here.
 */
export function DebugOverlay(props: Omit<DebugInput, "feedAgeSec"> & { fetchedAt: number | null }) {
  const on = useFlag("labs");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  const feedAgeSec =
    props.fetchedAt && now ? Math.max(0, Math.round((now - props.fetchedAt) / 1000)) : null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-[calc(var(--hud-h,76px)+0.5rem)] z-30 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 font-mono text-[10px] leading-tight text-white/90"
    >
      {debugLines({ ...props, feedAgeSec }).map(([k, v]) => (
        <div key={k}>
          <span className="text-white/60">{k}: </span>
          {v}
        </div>
      ))}
    </div>
  );
}
