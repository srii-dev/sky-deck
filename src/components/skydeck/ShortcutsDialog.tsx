import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "@/lib/shortcuts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The keyboard shortcut list. Controlled, so it opens from the "?" key and from Settings. */
export function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press a key while the map has focus. Shortcuts pause while you type in a box or have a
            dialog open. The arrow keys, + and - keep moving and zooming the map.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.action} className="flex items-center justify-between gap-4 text-sm">
              <span>{s.label}</span>
              <kbd className="data-value min-w-8 shrink-0 rounded border border-border bg-background/60 px-2 py-0.5 text-center text-xs">
                {s.cap}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          You can turn the shortcuts off in Settings (the gear in the map tools).
        </p>
      </DialogContent>
    </Dialog>
  );
}
