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
        <span className="font-display text-xs font-semibold uppercase tracking-[0.2em]">
          {label}
        </span>
      </span>
      {/* Fixed-width slots (tabular numerals) so the chip does not resize and push the search box around. */}
      <span className="data-value inline-block min-w-[9ch] whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        {age == null ? "—" : isFetching && age > 6 ? "updating…" : `${age}s ago`}
      </span>
      {behind && fetchedAt != null && (
        <span className="data-value hidden whitespace-nowrap text-[11px] text-muted-foreground lg:inline">
          {behind}
        </span>
      )}
      {/* No count before the first response: "0 ac" is not data yet, and the extra
          width pushed the Filters button onto a second row at ~1280 px. */}
      {fetchedAt != null && (
        <span className="data-value hidden min-w-[10ch] whitespace-nowrap text-[11px] tabular-nums text-muted-foreground sm:inline-block">
          {shown === total ? `${total} ac` : `${shown}/${total} ac`}
        </span>
      )}
    </div>
  );
}
