import { useState } from "react";
import { Check, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHAPE_LABELS, type IconShape } from "@/lib/aircraft-shape";
import {
  ACHIEVEMENTS,
  challengesForDay,
  dayKey,
  isUnlocked,
  type Collection,
} from "@/lib/collection";
import { cn } from "@/lib/utils";

/* Collection (Phase 13a to 13c): what has been opened, today's challenges and the achievements. */

function Bar({ have, need }: { have: number; need: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={need}
      aria-valuenow={have}
    >
      <div
        className={cn("h-full rounded-full", have >= need ? "bg-primary" : "bg-primary/60")}
        style={{ width: Math.round((100 * have) / Math.max(1, need)) + "%" }}
      />
    </div>
  );
}

export function CollectionDialog({
  open,
  onOpenChange,
  collection,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: Collection;
  onClear: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const c = collection;
  const day = dayKey(Date.now());
  const today =
    c.daily.day === day ? c.daily : { ...c.daily, shapes: [], types: [], count: 0, done: [] };
  const typeList = Object.entries(c.types)
    .sort((a, b) => b[1].first - a[1].first)
    .slice(0, 40);
  const nTypes = Object.keys(c.types).length;
  const nRegs = Object.keys(c.regs).length;
  const unlockedCount = ACHIEVEMENTS.filter((a) => isUnlocked(a, c)).length;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setConfirm(false);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Collection</DialogTitle>
          <DialogDescription>
            Every aircraft type and registration you open on the map is remembered here, in this
            browser only.
          </DialogDescription>
        </DialogHeader>

        <section className="grid grid-cols-3 gap-2 text-center" aria-label="Totals">
          {[
            ["Types", nTypes],
            ["Registrations", nRegs],
            ["Achievements", unlockedCount + "/" + ACHIEVEMENTS.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border px-2 py-2">
              <div className="data-value text-lg">{value}</div>
              <div className="hud-label">{label}</div>
            </div>
          ))}
        </section>

        <section className="space-y-2" aria-label="Today's challenges">
          <h3 className="hud-label">Today&apos;s challenges</h3>
          <ul className="space-y-2">
            {challengesForDay(day).map((ch) => {
              const p = ch.progress(today);
              const done = today.done.includes(ch.id) || p.have >= p.need;
              return (
                <li key={ch.id} className="space-y-1">
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span className={done ? "text-muted-foreground line-through" : ""}>
                      {ch.title}
                    </span>
                    {done ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Done" />
                    ) : (
                      <span className="data-value shrink-0 text-xs">
                        {p.have}/{p.need}
                      </span>
                    )}
                  </div>
                  <Bar have={p.have} need={p.need} />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            New challenges every day. {c.challengesDone} completed so far.
          </p>
        </section>

        <section className="space-y-2" aria-label="Achievements">
          <h3 className="hud-label">Achievements</h3>
          <ul className="space-y-2">
            {ACHIEVEMENTS.map((a) => {
              const p = a.progress(c);
              const got = p.have >= p.need;
              return (
                <li key={a.id} className="space-y-1">
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span className={got ? "" : "text-muted-foreground"}>
                      <span className="data-value">{a.name}</span>
                      <span className="block text-xs text-muted-foreground">{a.description}</span>
                    </span>
                    {got ? (
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-label="Unlocked"
                      />
                    ) : (
                      <Lock
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Locked"
                      />
                    )}
                  </div>
                  {!got && <Bar have={p.have} need={p.need} />}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-2" aria-label="Types collected">
          <h3 className="hud-label">Types collected (newest first)</h3>
          {typeList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Open an aircraft on the map to start your collection.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {typeList.map(([code, t]) => (
                <li
                  key={code}
                  className="rounded border border-border px-1.5 py-0.5 text-xs"
                  title={
                    SHAPE_LABELS[t.shape as IconShape] +
                    ", opened " +
                    t.count +
                    " time" +
                    (t.count === 1 ? "" : "s")
                  }
                >
                  <span className="data-value">{code}</span>
                  {t.count > 1 ? <span className="text-muted-foreground"> ×{t.count}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {nTypes > typeList.length && (
            <p className="text-xs text-muted-foreground">
              Showing the newest {typeList.length} of {nTypes}.
            </p>
          )}
        </section>

        <section aria-label="Reset">
          {confirm ? (
            <div className="flex items-center gap-2 text-sm">
              <span>Delete your whole collection?</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onClear();
                  setConfirm(false);
                }}
              >
                Delete
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={nTypes === 0 && nRegs === 0}
              onClick={() => setConfirm(true)}
            >
              Clear collection…
            </Button>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
