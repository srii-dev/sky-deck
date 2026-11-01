import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  fetchedAt: number | null;
  error: string | null;
  isFetching: boolean;
  shown: number;
  total: number;
  source: string | null;
}

export function LiveIndicator({ fetchedAt, error, isFetching, shown, total, source }: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const age = fetchedAt && now ? Math.max(0, Math.round((now - fetchedAt) / 1000)) : null;
  const stale = age == null || age > 25 || !!error;
  const label = fetchedAt == null ? "Connecting" : stale ? "Delayed" : "Live";

  return (
    <div className="flex items-center gap-3" title={source ? `Data: ${source}` : undefined}>
      <span className={cn("flex items-center gap-2", stale ? "text-warning" : "text-success")}>
        <span className={cn("size-2 rounded-full bg-current", !stale && "live-dot")} />
        <span className="font-display text-xs font-semibold uppercase tracking-[0.2em]">{label}</span>
      </span>
      <span className="data-value whitespace-nowrap text-[11px] text-muted-foreground">
        {age == null ? "—" : isFetching && age > 6 ? "updating…" : `${age}s ago`}
      </span>
      <span className="data-value hidden whitespace-nowrap text-[11px] text-muted-foreground sm:inline">
        {shown === total ? `${total} ac` : `${shown}/${total} ac`}
      </span>
    </div>
  );
}
