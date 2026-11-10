import { useState, type ReactNode } from "react";
import { BookOpen, Code, Download, Info, Keyboard, Monitor, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildLocalExport, localExportFilename } from "@/lib/data-export";
import { downloadText } from "@/lib/download";
import { clearLocalData, POLL_NORMAL_MS, POLL_SAVER_MS } from "@/lib/local-settings";
import { useTheme } from "@/hooks/use-theme";
import { COLOR_MODE_LABELS, COLOR_MODES, type ColorMode } from "@/lib/airline-colors";
import { THEME_LABELS, THEME_PREFS, type ThemePref } from "@/lib/theme";
import { UNIT_LABELS, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { Basemap } from "./map-config";

export interface SettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: UnitSystem;
  onUnits: (u: UnitSystem) => void;
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  terrain: boolean;
  onTerrain: (v: boolean) => void;
  showTrail: boolean;
  onShowTrail: (v: boolean) => void;
  trail3d: boolean;
  onTrail3d: (v: boolean) => void;
  batterySaver: boolean;
  onBatterySaver: (v: boolean) => void;
  smoothMotion: boolean;
  onSmoothMotion: (v: boolean) => void;
  /** The display delay in use, in seconds, or null before it is known. */
  motionDelaySec: number | null;
  shortcutsOn: boolean;
  onShortcutsOn: (v: boolean) => void;
  onOpenGuide: () => void;
  /** Hide the controls for a display (Phase 22k). */
  onKiosk: () => void;
  /** Aircraft colour (Phase 24b) and the embed snippet (Phase 24f). */
  colorBy: ColorMode;
  onColorBy: (c: ColorMode) => void;
  onCopyEmbed: () => void;
  onOpenShortcuts: () => void;
  onOpenCredits: () => void;
  onOpenAccount: () => void;
}

const BASEMAP_LABELS: Record<Basemap, string> = {
  dark: "Dark",
  satellite: "Satellite",
  light: "Light",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="hud-label">{title}</h3>
      {children}
    </section>
  );
}

/** The whole row is the tap target (a Switch alone is only 36 by 20 px). */
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
      <span>
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function LinkRow({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-md px-1 text-left text-sm text-muted-foreground transition-colors hover:text-primary [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {icon}
      {children}
    </button>
  );
}

const seg = "h-10 flex-1 px-3";

/**
 * Settings (Phase 22i). Everything here is kept in this browser only; there is no account. It
 * re-presents the choices that already exist (units, map style, layers) and adds the battery
 * saver, the shortcut switch, the saved-data export and reset, and links to the guide and credits.
 */
export function SettingsDialog(p: SettingsProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const theme = useTheme();

  const closeThen = (fn: () => void) => () => {
    setConfirmReset(false);
    p.onOpenChange(false);
    fn();
  };

  const exportData = () => {
    const now = new Date();
    const data = buildLocalExport(localStorage, now);
    const ok = downloadText(
      localExportFilename(now),
      "application/json;charset=utf-8",
      JSON.stringify(data, null, 2) + String.fromCharCode(10),
    );
    toast(ok ? "Saved your data as JSON" : "Download is not available here");
  };

  const reset = () => {
    clearLocalData();
    // Reload without the link parameters, so a shared basemap is not remembered again.
    window.location.assign(window.location.pathname);
  };

  return (
    <Dialog
      open={p.open}
      onOpenChange={(o) => {
        if (!o) setConfirmReset(false);
        p.onOpenChange(o);
      }}
    >
      <DialogContent className="glass-panel max-h-[88dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Settings</DialogTitle>
          <DialogDescription>
            Kept in this browser only. SkyDeck has no accounts and does not track you.
          </DialogDescription>
        </DialogHeader>

        <Section title="Theme">
          <ToggleGroup
            type="single"
            variant="outline"
            value={theme.pref}
            onValueChange={(v) => v && theme.setPref(v as ThemePref)}
            aria-label="Theme"
            className="gap-2"
          >
            {THEME_PREFS.map((t) => (
              <ToggleGroupItem key={t} value={t} className={seg}>
                {THEME_LABELS[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            The page and its panels. The map style below is a separate choice.
          </p>
        </Section>

        <Section title="Aircraft colour">
          <ToggleGroup
            type="single"
            variant="outline"
            value={p.colorBy}
            onValueChange={(v) => v && p.onColorBy(v as ColorMode)}
            aria-label="Aircraft colour"
            className="gap-2"
          >
            {COLOR_MODES.map((c) => (
              <ToggleGroupItem key={c} value={c} className={seg}>
                {COLOR_MODE_LABELS[c]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            By airline gives each airline its own plain colour (not its livery); aircraft without an
            airline code are grey.
          </p>
        </Section>

        <Section title="Units">
          <ToggleGroup
            type="single"
            variant="outline"
            value={p.units}
            onValueChange={(v) => v && p.onUnits(v as UnitSystem)}
            aria-label="Units"
            className="gap-2"
          >
            {(Object.keys(UNIT_LABELS) as UnitSystem[]).map((u) => (
              <ToggleGroupItem key={u} value={u} className={seg}>
                {UNIT_LABELS[u]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>

        <Section title="Map style">
          <ToggleGroup
            type="single"
            variant="outline"
            value={p.basemap}
            onValueChange={(v) => v && p.onBasemap(v as Basemap)}
            aria-label="Map style"
            className="gap-2"
          >
            {(Object.keys(BASEMAP_LABELS) as Basemap[]).map((b) => (
              <ToggleGroupItem key={b} value={b} className={seg}>
                {BASEMAP_LABELS[b]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>

        <Section title="Layers on start">
          <SwitchRow label="Terrain and buildings" checked={p.terrain} onChange={p.onTerrain} />
          <SwitchRow label="Aircraft trail" checked={p.showTrail} onChange={p.onShowTrail} />
          <SwitchRow
            label="3D trail"
            hint="Draws the trail at real altitude"
            checked={p.trail3d}
            onChange={p.onTrail3d}
          />
        </Section>

        <Section title="Phone and battery">
          <SwitchRow
            label="Smooth motion"
            hint={
              p.smoothMotion
                ? "Draws aircraft a few seconds behind the data so they glide without jumps" +
                  (p.motionDelaySec != null ? " (now " + p.motionDelaySec + " s behind)." : ".")
                : "Live: a shorter delay, but aircraft positions between updates are estimated and can jump."
            }
            checked={p.smoothMotion}
            onChange={p.onSmoothMotion}
          />
          <SwitchRow
            label="Battery saver"
            hint={`Refreshes aircraft every ${POLL_SAVER_MS / 1000} s instead of ${POLL_NORMAL_MS / 1000} s. Emergency squawk alerts take longer to appear.`}
            checked={p.batterySaver}
            onChange={p.onBatterySaver}
          />
        </Section>

        <Section title="Keyboard">
          <SwitchRow
            label="Keyboard shortcuts"
            hint="Single keys such as / for search and N for the next aircraft"
            checked={p.shortcutsOn}
            onChange={p.onShortcutsOn}
          />
          <LinkRow icon={<Keyboard />} onClick={closeThen(p.onOpenShortcuts)}>
            Show the shortcut list
          </LinkRow>
        </Section>

        <Section title="Account">
          <LinkRow icon={<UserRound />} onClick={closeThen(p.onOpenAccount)}>
            Sign in or manage your account
          </LinkRow>
          <p className="text-xs text-muted-foreground">
            Optional. SkyDeck works without an account.
          </p>
        </Section>

        <Section title="Display">
          <LinkRow icon={<Monitor />} onClick={closeThen(p.onKiosk)}>
            Clean view for a display
          </LinkRow>
          <p className="text-xs text-muted-foreground">
            Hides the controls and panels and keeps the map, the credit and emergency alerts. Press
            K or Esc, or use the button at the bottom, to leave it.
          </p>
          <LinkRow icon={<Code />} onClick={p.onCopyEmbed}>
            Copy embed code for this view
          </LinkRow>
          <p className="text-xs text-muted-foreground">
            A snippet to paste into a web page: it shows this part of the map with no controls and a
            link back here.
          </p>
        </Section>

        <Section title="Help">
          <LinkRow icon={<BookOpen />} onClick={closeThen(p.onOpenGuide)}>
            Show the quick guide again
          </LinkRow>
          <LinkRow icon={<Info />} onClick={closeThen(p.onOpenCredits)}>
            Credits and data sources
          </LinkRow>
        </Section>

        <Section title="Your data">
          <p className="text-xs text-muted-foreground">
            Saved views, recent searches, these settings and your last map position live only in
            this browser.
          </p>
          <Button type="button" variant="secondary" className="h-10 w-full" onClick={exportData}>
            <Download /> Download my data (JSON)
          </Button>
          {confirmReset ? (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm"
            >
              <p>
                This deletes your saved views, recent searches and settings from this browser and
                reloads the page. It cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="destructive" className="h-10 flex-1" onClick={reset}>
                  Delete and reload
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 flex-1"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className={cn("h-10 w-full text-destructive hover:text-destructive")}
              onClick={() => setConfirmReset(true)}
            >
              <Trash2 /> Delete my saved data
            </Button>
          )}
        </Section>
      </DialogContent>
    </Dialog>
  );
}
