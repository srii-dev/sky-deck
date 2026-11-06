import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CREDIT_GROUPS, CREDITS, CREDITS_DISCLAIMER, type CreditEntry } from "@/lib/credits";

function Entry({ entry }: { entry: CreditEntry }) {
  return (
    <li className="space-y-1 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-foreground">{entry.name}</span>
        <span className="text-[11px] text-muted-foreground">{entry.usedFor}</span>
      </div>
      <p className="text-sm leading-snug text-foreground/90">{entry.credit}</p>
      <p className="text-xs leading-snug text-muted-foreground">{entry.licence}</p>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {entry.links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            {l.label}
          </a>
        ))}
      </p>
    </li>
  );
}

/** The credits and data-sources list. Controlled, so it can be opened from a menu that closes first. */
export function CreditsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Credits and data sources</DialogTitle>
          <DialogDescription>
            SkyDeck relies on free community data. Thank you to everyone who runs and shares it.
          </DialogDescription>
        </DialogHeader>
        {CREDIT_GROUPS.map((group) => (
          <section key={group} className="space-y-2">
            <h3 className="hud-label">{group}</h3>
            <ul className="space-y-2">
              {CREDITS.filter((c) => c.group === group).map((c) => (
                <Entry key={c.id} entry={c} />
              ))}
            </ul>
          </section>
        ))}
        <p className="text-[11px] leading-snug text-warning/90">{CREDITS_DISCLAIMER}</p>
      </DialogContent>
    </Dialog>
  );
}

/** A text button that opens the credits on its own (for pages without a menu to close first). */
export function CreditsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Credits and data sources
      </button>
      <CreditsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
