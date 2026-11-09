import { useEffect, useState } from "react";
import {
  Bookmark,
  Layers,
  Link2,
  Loader2,
  LocateFixed,
  Maximize,
  Minimize,
  Ruler,
  History,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { locate } from "@/lib/geolocate";
import { addView, loadViews, removeView, storeViews, type SavedView } from "@/lib/saved-views";
import { cn } from "@/lib/utils";
import type { Viewport } from "./map-config";

export interface WeatherControls {
  radar: boolean;
  onRadar: (v: boolean) => void;
  echoTops: boolean;
  onEchoTops: (v: boolean) => void;
  advisories: boolean;
  onAdvisories: (v: boolean) => void;
  pireps: boolean;
  onPireps: (v: boolean) => void;
}

export interface LayerControls {
  terrain: boolean;
  onTerrain: (v: boolean) => void;
  showTrail: boolean;
  onShowTrail: (v: boolean) => void;
  trail3d: boolean;
  onTrail3d: (v: boolean) => void;
  glideRing: boolean;
  onGlideRing: (v: boolean) => void;
  /** The glide ring needs a selected aircraft. */
  hasSelection: boolean;
  weather: WeatherControls;
  /** Route line and airspace areas (Phase 8). */
  routeLine: boolean;
  onRouteLine: (v: boolean) => void;
  airspaceControlled: boolean;
  onAirspaceControlled: (v: boolean) => void;
  airspaceSpecial: boolean;
  onAirspaceSpecial: (v: boolean) => void;
}

export interface RulerControls {
  active: boolean;
  onToggle: () => void;
  /** Distance and bearing once two points are set. */
  summary: string | null;
  hasPoints: boolean;
  onClear: () => void;
}

interface Props {
  /** The latest map view (not debounced), or null before the map exists. */
  view: Viewport | null;
  onFly: (lat: number, lon: number, zoom?: number) => void;
  /** The address that reopens the current view. */
  getShareUrl: () => string;
  layers: LayerControls;
  ruler: RulerControls;
  /** Called with the user's position after My location succeeds (used for nearby airports). */
  onLocated?: (pos: { lat: number; lon: number }) => void;
  onOpenSettings: () => void;
  /** Opens the watchlist dialog (Phase 5a). */
  onOpenWatchlist: () => void;
  watchCount: number;
  /** Session replay (Phase 9a). */
  replay: { available: boolean; active: boolean; onStart: () => void; onStop: () => void };
}

const btn = "h-10 w-10";

function LayerRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 py-2 text-sm",
        disabled && "opacity-50",
      )}
    >
      <span>
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled ?? false} />
    </label>
  );
}

/** Small vertical column of map tools: share link, my location, layers, ruler, saved views, fullscreen, settings. */
export function MapTools({
  view,
  onFly,
  getShareUrl,
  layers,
  ruler,
  onLocated,
  onOpenSettings,
  onOpenWatchlist,
  watchCount,
  replay,
}: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Read after hydration so the first render matches the server.
  useEffect(() => setViews(loadViews()), []);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("Full screen is not available here");
    }
  };

  const copyLink = async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      // Clipboard blocked (insecure page or permissions): show the link so it can be copied by hand.
      toast(url, { duration: 15_000 });
    }
  };

  const goToMe = async () => {
    setLocating(true);
    try {
      const p = await locate();
      onFly(p.lat, p.lon, 10);
      onLocated?.(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    if (!view || view.zoom === undefined) return;
    const next = addView(views, {
      name,
      lat: view.lat,
      lon: view.lon,
      zoom: view.zoom,
      pitch: view.pitch,
      bearing: view.bearing,
    });
    if (!next) {
      toast("Give the view a name first");
      return;
    }
    setViews(next);
    storeViews(next);
    setName("");
    toast("View saved");
  };

  const remove = (n: string) => {
    const next = removeView(views, n);
    setViews(next);
    storeViews(next);
  };

  return (
    <div className="pointer-events-auto flex items-start gap-2">
      {/* In a short window (a phone on its side) the column wraps into a second column instead of running off the screen. */}
      <div className="flex max-h-[calc(100dvh-var(--hud-h,76px)-84px)] flex-col flex-wrap content-start gap-2">
        <Button
          variant="panel"
          size="icon"
          className={btn}
          aria-label="Copy link to this view"
          title="Copy link to this view"
          onClick={() => void copyLink()}
        >
          <Link2 />
        </Button>
        <Button
          variant="panel"
          size="icon"
          className={btn}
          aria-label="Go to my location"
          title="Go to my location"
          disabled={locating}
          onClick={() => void goToMe()}
        >
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="panel"
              size="icon"
              className={btn}
              aria-label="Map layers"
              title="Map layers"
            >
              <Layers />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="right" className="glass-panel w-64">
            <div className="hud-label mb-1">Layers</div>
            <LayerRow
              label="Terrain and buildings"
              checked={layers.terrain}
              onChange={layers.onTerrain}
            />
            <LayerRow
              label="Aircraft trail"
              checked={layers.showTrail}
              onChange={layers.onShowTrail}
            />
            <LayerRow
              label="3D trail"
              hint="Draws the trail at real altitude"
              checked={layers.trail3d}
              onChange={layers.onTrail3d}
              disabled={!layers.showTrail}
            />
            <LayerRow
              label="Glide range ring"
              hint={layers.hasSelection ? "For the selected aircraft" : "Select an aircraft first"}
              checked={layers.glideRing}
              onChange={layers.onGlideRing}
              disabled={!layers.hasSelection}
            />
            <div className="hud-label mb-1 mt-3">Routes and airspace</div>
            <LayerRow
              label="Route line"
              hint={
                layers.hasSelection
                  ? "Straight line between the airports (approximate)"
                  : "Select an aircraft first"
              }
              checked={layers.routeLine}
              onChange={layers.onRouteLine}
              disabled={!layers.hasSelection}
            />
            <LayerRow
              label="Controlled airspace"
              hint="Class B, C and D (US, zoom in)"
              checked={layers.airspaceControlled}
              onChange={layers.onAirspaceControlled}
            />
            <LayerRow
              label="Special use areas"
              hint="Restricted, prohibited, warning, alert, MOA (US, zoom in)"
              checked={layers.airspaceSpecial}
              onChange={layers.onAirspaceSpecial}
            />
            <div className="hud-label mb-1 mt-3">Weather</div>
            <LayerRow
              label="Precipitation radar"
              hint="Past frames, worldwide, with a timeline"
              checked={layers.weather.radar}
              onChange={layers.weather.onRadar}
            />
            <LayerRow
              label="Echo tops"
              hint="Storm height, US only"
              checked={layers.weather.echoTops}
              onChange={layers.weather.onEchoTops}
            />
            <LayerRow
              label="SIGMETs and AIRMETs"
              hint="Turbulence, storms, icing, low visibility"
              checked={layers.weather.advisories}
              onChange={layers.weather.onAdvisories}
            />
            <LayerRow
              label="Pilot reports"
              hint="Reports from the last 2 hours"
              checked={layers.weather.pireps}
              onChange={layers.weather.onPireps}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Your choices are remembered in this browser.
            </p>
          </PopoverContent>
        </Popover>
        <Button
          variant="panel"
          size="icon"
          className={cn(btn, ruler.active && "border-primary text-primary")}
          aria-label="Measure distance"
          aria-pressed={ruler.active}
          title="Measure distance: click two points on the map"
          onClick={ruler.onToggle}
        >
          <Ruler />
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="panel"
              size="icon"
              className={btn}
              aria-label="Saved views"
              title="Saved views"
            >
              <Bookmark />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="right" className="glass-panel w-72">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this view"
                aria-label="Name for the saved view"
                maxLength={40}
                className="h-9 text-sm"
              />
              <Button type="submit" size="sm" variant="secondary">
                Save
              </Button>
            </form>
            {views.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Saved views stay in this browser. Move the map, name it and press Save.
              </p>
            ) : (
              <ul className="mt-3 max-h-60 space-y-1 overflow-auto">
                {views.map((v) => (
                  <li key={v.name} className="flex items-center gap-1">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-secondary"
                      onClick={() => {
                        onFly(v.lat, v.lon, v.zoom);
                        setOpen(false);
                      }}
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete saved view ${v.name}`}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(v.name)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        <Button
          variant="panel"
          size="icon"
          className={btn}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          title={fullscreen ? "Exit full screen" : "Full screen"}
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>
        <Button
          variant="panel"
          size="icon"
          className={cn(btn, replay.active && "border-primary text-primary")}
          aria-label={replay.active ? "Back to live" : "Replay the last minutes"}
          aria-pressed={replay.active}
          title={
            replay.active
              ? "Back to live"
              : replay.available
                ? "Replay what this page has seen"
                : "Replay needs about 20 seconds of recording"
          }
          disabled={!replay.active && !replay.available}
          onClick={replay.active ? replay.onStop : replay.onStart}
        >
          <History />
        </Button>
        <Button
          variant="panel"
          size="icon"
          className={btn}
          aria-label={watchCount > 0 ? "Watchlist, " + watchCount + " items" : "Watchlist"}
          title="Watchlist and recently viewed"
          onClick={onOpenWatchlist}
        >
          <Star />
        </Button>
        <Button
          variant="panel"
          size="icon"
          className={btn}
          aria-label="Settings"
          title="Settings (,)"
          onClick={onOpenSettings}
        >
          <Settings />
        </Button>
      </div>
      {ruler.active && (
        <div
          className="glass-panel flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          role="status"
        >
          <span className="data-value text-primary">
            {ruler.summary ?? (ruler.hasPoints ? "Click a second point" : "Click a start point")}
          </span>
          {ruler.hasPoints && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={ruler.onClear}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
