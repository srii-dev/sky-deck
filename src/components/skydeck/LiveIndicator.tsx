import { useEffect, useState } from "react";
import { formatBehind } from "@/lib/live-status";
import { cn } from "@/lib/utils";

interface Props {
  fetchedAt: number | null;
  /** How old the data already was at `fetchedAt`, ms (the server answers from older copies to save quota). */
  dataAgeMs?: number | undefined;
  error: string | null;
  isFetching: boolean;
  shown: number;
  total: number;
  source: string | null;
  /** The display delay in use, in seconds, or null before it is known. */
  delaySec?: number | null | undefined;
  /** During a replay the picture is not live. */
  replay?: boolean | undefined;
}

export function LiveIndicator({
  fetchedAt,
  dataAgeMs = 0,
  error,
  isFetching,
  shown,
  total,
  source,
  delaySec,
  replay,
}: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const age =
    fetchedAt && now ? Math.max(0, Math.round((now - fetchedAt + dataAgeMs) / 1000)) : null;
  const stale = age == null || age > 25 || !!error;
  const label = replay ? "Replay" : fetchedAt == null ? "Loading" : stale ? "Delayed" : "Live";
  const behind = formatBehind(delaySec, !!replay);

  return (
    <div className="flex items-center gap-3">
      <span className={cn("flex items-center gap-2", stale ? "text-warning" : "text-success")}>
        <span className={cn("size-2 rounded-full bg-current", !stale && "live-dot")} />
        <span className="inline-block min-w-[4.3rem] font-display text-xs font-semibold uppercase tracking-[0.2em]">
          {label}
        </span>
      </span>
      {/* Fixed-width slots (tabular numerals) so the chip does not resize and push the search box around. */}
      <span className="data-value inline-block min-w-[9ch] whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        {age == null ? "—" : isFetching && age > 6 ? "updating…" : `${age}s ago`}
      </span>
      {/* The delay and count slots are always in the layout (invisible until there is something to show), so the
          chip is as wide while loading as when live and nothing next to it moves when the first answer arrives.
          There is still no "0 ac" before the first response: the slot is empty, not a number. */}
      <span
        className={cn(
          "data-value hidden min-w-[11ch] whitespace-nowrap text-[11px] tabular-nums text-muted-foreground lg:inline-block",
          !(behind && fetchedAt != null) && "invisible",
        )}
      >
        {behind && fetchedAt != null ? behind : ""}
      </span>
      <span
        className={cn(
          "data-value hidden min-w-[10ch] whitespace-nowrap text-[11px] tabular-nums text-muted-foreground sm:inline-block",
          fetchedAt == null && "invisible",
        )}
      >
        {fetchedAt == null ? "" : shown === total ? `${total} ac` : `${shown}/${total} ac`}
      </span>
    </div>
  );
}
