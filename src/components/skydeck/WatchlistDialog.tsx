import { Bell, History, Plane, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { Aircraft } from "@/lib/aircraft";
import { fmtAltitude, type UnitSystem } from "@/lib/units";
import {
  recentFlightLabel,
  type RecentFlight,
  type WatchItem,
  type WatchKind,
} from "@/lib/watchlist";
import { watchMatches } from "@/lib/watchlist";
import type { SyncStatus } from "@/hooks/use-personal-data";

/* Watchlist (Phase 5a), recently viewed flights (5c) and the alerts switch (5b). */

const KIND_NAMES: Record<WatchKind, string> = {
  flight: "Flight",
  aircraft: "Aircraft",
  airport: "Airport",
};

function liveStatus(
  item: WatchItem,
  aircraft: readonly Aircraft[],
  units: UnitSystem,
): {
  text: string;
  hex: string | null;
} {
  if (item.kind === "airport") return { text: "", hex: null };
  const found = aircraft.find((a) => watchMatches([item], a).length > 0);
  if (!found) return { text: "Not in view", hex: null };
  const where = found.onGround ? "On the ground" : "Airborne, " + fmtAltitude(found.altFt, units);
  return { text: where, hex: found.hex };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  watch: readonly WatchItem[];
  recent: readonly RecentFlight[];
  aircraft: readonly Aircraft[];
  units: UnitSystem;
  alertsOn: boolean;
  onAlertsOn: (v: boolean) => void;
  sync: SyncStatus;
  signedIn: boolean;
  onOpenWatch: (item: WatchItem) => void;
  onRemoveWatch: (item: WatchItem) => void;
  onOpenRecent: (r: RecentFlight) => void;
  onClearRecent: () => void;
  onOpenAccount: () => void;
  /** Opens the alert rules dialog (Phase 10). */
  onOpenRules: () => void;
  ruleCount: number;
}

const SYNC_TEXT: Record<SyncStatus, string> = {
  off: "",
  syncing: "Saving to your account…",
  synced: "Saved to your account.",
  error: "Could not save to your account just now. The lists are kept on this device.",
};

export function WatchlistDialog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Watchlist</DialogTitle>
          <DialogDescription>
            Flights, aircraft and airports you want to keep an eye on. Alerts appear while this page
            is open.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2" aria-label="Alerts">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <Bell className="size-4" aria-hidden /> Alerts for takeoff, landing and emergency
              squawk
            </span>
            <Switch checked={p.alertsOn} onCheckedChange={p.onAlertsOn} />
          </label>
          <Button variant="outline" size="sm" onClick={p.onOpenRules}>
            Alert rules{p.ruleCount > 0 ? " (" + p.ruleCount + ")" : ""}…
          </Button>
        </section>

        <section className="space-y-2" aria-label="Watched items">
          <h3 className="hud-label">Watching ({p.watch.length})</h3>
          {p.watch.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Open an aircraft or an airport and use its Watch button.
            </p>
          ) : (
            <ul className="space-y-1">
              {p.watch.map((w) => {
                const s = liveStatus(w, p.aircraft, p.units);
                return (
                  <li
                    key={w.kind + w.key}
                    className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => p.onOpenWatch(w)}
                      aria-label={"Show " + KIND_NAMES[w.kind] + " " + w.label}
                    >
                      <span className="data-value block truncate text-sm">{w.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {KIND_NAMES[w.kind]}
                        {s.text ? " · " + s.text : ""}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={"Stop watching " + w.label}
                      onClick={() => p.onRemoveWatch(w)}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2" aria-label="Recently viewed flights">
          <div className="flex items-center justify-between">
            <h3 className="hud-label flex items-center gap-1.5">
              <History className="size-3.5" aria-hidden /> Recently viewed
            </h3>
            {p.recent.length > 0 && (
              <Button variant="ghost" size="sm" onClick={p.onClearRecent}>
                <Trash2 /> Clear
              </Button>
            )}
          </div>
          {p.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Flights you open will show up here.</p>
          ) : (
            <ul className="space-y-1">
              {p.recent.map((r) => (
                <li key={r.hex}>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => p.onOpenRecent(r)}
                  >
                    <Plane className="size-4 shrink-0" aria-hidden />
                    <span className="data-value truncate">{recentFlightLabel(r)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[r.registration, r.type].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          {p.signedIn ? (
            SYNC_TEXT[p.sync]
          ) : (
            <>
              These lists are kept in this browser.{" "}
              <button className="underline" onClick={p.onOpenAccount}>
                Sign in
              </button>{" "}
              to keep them on every device.
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
