import { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, MapPin, Plane, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { searchAircraft } from "@/lib/adsb.functions";
import { findAirport, searchAirports, type Airport } from "@/lib/airports";
import type { Aircraft } from "@/lib/aircraft";
import { addRecent, loadRecent, rankAircraft, storeRecent } from "@/lib/search-rank";
import { cn } from "@/lib/utils";

interface Props {
  aircraft: Aircraft[];
  onAircraft: (a: Aircraft) => void;
  onAirport: (a: Airport) => void;
}

type Item =
  { kind: "ac"; a: Aircraft } | { kind: "apt"; a: Airport } | { kind: "recent"; term: string };

export function SearchBox({ aircraft, onAircraft, onAirport }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // Read after hydration so the first render matches the server.
  useEffect(() => setRecent(loadRecent()), []);

  const items = useMemo<Item[]>(() => {
    const s = q.trim().toUpperCase();
    if (s.length < 2) return recent.map((term) => ({ kind: "recent" as const, term }));
    const ac = rankAircraft(s, aircraft, 6).map((a) => ({ kind: "ac" as const, a }));
    const apt = searchAirports(s, 4).map((a) => ({ kind: "apt" as const, a }));
    return [...apt, ...ac];
  }, [q, aircraft, recent]);

  const remember = (term: string) => {
    const next = addRecent(recent, term);
    setRecent(next);
    storeRecent(next);
  };

  const pick = (it: Item) => {
    if (it.kind === "recent") {
      setQ(it.term);
      setActive(0);
      return;
    }
    remember(q);
    if (it.kind === "ac") onAircraft(it.a);
    else onAirport(it.a);
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  };

  const submit = async () => {
    if (items[active]) return pick(items[active]);
    const s = q.trim();
    if (s.length < 2) return;
    const apt = findAirport(s);
    if (apt) return pick({ kind: "apt", a: apt });
    setBusy(true);
    try {
      const res = await searchAircraft({ data: { q: s } });
      if (res.aircraft[0]) pick({ kind: "ac", a: res.aircraft[0] });
      else toast(res.error ?? `No live aircraft or airport matches “${s.toUpperCase()}”`);
    } catch {
      toast.error("Search failed — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full">
      <div className="glass-panel flex items-center rounded-md pl-3">
        {busy ? (
          <Loader2 className="size-4 animate-spin text-primary" />
        ) : (
          <Search className="size-4 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "ArrowDown") setActive((i) => Math.min(items.length - 1, i + 1));
            if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Callsign, reg., hex or airport"
          aria-label="Search flights and airports"
          className="data-value h-10 border-0 bg-transparent text-sm uppercase shadow-none placeholder:normal-case placeholder:text-muted-foreground focus-visible:ring-0"
        />
        {q && (
          <button
            aria-label="Clear search"
            onClick={() => setQ("")}
            className="px-3 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && items.length > 0 && (
        <ul className="glass-panel absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md py-1">
          {items.map((it, i) => (
            <li
              key={
                it.kind + (it.kind === "ac" ? it.a.hex : it.kind === "apt" ? it.a.icao : it.term)
              }
            >
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(it)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                  i === active && "bg-secondary",
                )}
              >
                {it.kind === "recent" ? (
                  <>
                    <History className="size-4 text-muted-foreground" />
                    <span className="data-value truncate text-xs text-muted-foreground">
                      {it.term}
                    </span>
                  </>
                ) : it.kind === "apt" ? (
                  <>
                    <MapPin className="size-4 text-accent" />
                    <span className="data-value w-20 text-xs text-accent">
                      {it.a.iata} · {it.a.icao}
                    </span>
                    <span className="truncate text-muted-foreground">{it.a.name}</span>
                  </>
                ) : (
                  <>
                    <Plane className="size-4 text-primary" />
                    <span className="data-value w-20 text-xs text-primary">
                      {it.a.callsign ?? it.a.hex.toUpperCase()}
                    </span>
                    <span className="data-value truncate text-xs text-muted-foreground">
                      {[it.a.registration, it.a.type, it.a.operator].filter(Boolean).join(" · ")}
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
