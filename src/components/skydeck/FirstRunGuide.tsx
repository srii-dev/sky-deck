import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clampStep, GUIDE_STEPS } from "@/lib/first-run";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  /** Called when the guide is closed by Skip, Done, Escape or the close button. */
  onClose: () => void;
}

/** A short guide: five steps, Back and Next, skippable at any point. Controlled by the page. */
export function FirstRunGuide({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const i = clampStep(step);
  const s = GUIDE_STEPS[i]!;
  const last = i === GUIDE_STEPS.length - 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setStep(0);
          onClose();
        }
      }}
    >
      <DialogContent className="glass-panel max-w-md">
        <DialogHeader>
          <p className="hud-label">
            Quick guide · {i + 1} of {GUIDE_STEPS.length}
          </p>
          <DialogTitle className="font-display tracking-wide">{s.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground/90">
            {s.body}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {GUIDE_STEPS.map((g, n) => (
            <span
              key={g.title}
              className={cn("h-1.5 w-6 rounded-full", n === i ? "bg-primary" : "bg-secondary")}
            />
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => {
              setStep(0);
              onClose();
            }}
          >
            {last ? "Close" : "Skip"}
          </Button>
          {i > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="h-10"
              onClick={() => setStep(i - 1)}
            >
              Back
            </Button>
          )}
          <Button
            type="button"
            className="h-10"
            onClick={() => {
              if (last) {
                setStep(0);
                onClose();
              } else {
                setStep(i + 1);
              }
            }}
          >
            {last ? "Start exploring" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
