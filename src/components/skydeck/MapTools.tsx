import { useEffect, useState } from "react";
import { Bookmark, Link2, LocateFixed, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { locate } from "@/lib/geolocate";
import { addView, loadViews, removeView, storeViews, type SavedView } from "@/lib/saved-views";
import type { Viewport } from "./map-config";

interface Props {
  /** The latest map view (not debounced), or null before the map exists. */
  view: Viewport | null;
  onFly: (lat: number, lon: number, zoom?: number) => void;
  /** The address that reopens the current view. */
  getShareUrl: () => string;
}

const btn = "h-10 w-10";

/** Small vertical column of map tools: share link, my location, saved views. */
export function MapTools({ view, onFly, getShareUrl }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(false);
  // Read after hydration so the first render matches the server.
  useEffect(() => setViews(loadViews()), []);

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
    <div className="pointer-events-auto flex flex-col gap-2">
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
    </div>
  );
}
