import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { airlineCode, ALT_FILTER_MAX, DEFAULT_FILTERS, type Aircraft, type Filters } from "@/lib/aircraft";
import { airlineName } from "@/lib/airlines";
import { fmtAltitude, type UnitSystem } from "@/lib/units";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  aircraft: Aircraft[];
  units: UnitSystem;
}

const ANY = "__any";

export function FiltersPanel({ filters, onChange, aircraft, units }: Props) {
  const airlines = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of aircraft) {
      const c = airlineCode(a.callsign);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [aircraft]);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of aircraft) if (a.type) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [aircraft]);

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="hud-label text-foreground">Filters</span>
        <Button variant="hud" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
          Reset
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Label className="hud-label">Altitude</Label>
          <span className="data-value text-xs">
            {fmtAltitude(filters.altMin, units)} –{" "}
            {filters.altMax >= ALT_FILTER_MAX ? "∞" : fmtAltitude(filters.altMax, units)}
          </span>
        </div>
        <Slider
          min={0}
          max={ALT_FILTER_MAX}
          step={1000}
          value={[filters.altMin, filters.altMax]}
          onValueChange={([lo, hi]) => set({ altMin: lo, altMax: hi })}
          aria-label="Altitude range"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="f-type" className="hud-label">
          Aircraft type
        </Label>
        <Input
          id="f-type"
          list="f-type-list"
          value={filters.type}
          onChange={(e) => set({ type: e.target.value.toUpperCase().slice(0, 4) })}
          placeholder="e.g. B738, A32, B77"
          className="data-value uppercase"
        />
        <datalist id="f-type-list">
          {types.map(([t, n]) => (
            <option key={t} value={t}>
              {n} visible
            </option>
          ))}
        </datalist>
      </div>

      <div className="space-y-2">
        <Label className="hud-label">Airline</Label>
        <Select value={filters.airline || ANY} onValueChange={(v) => set({ airline: v === ANY ? "" : v })}>
          <SelectTrigger className="data-value">
            <SelectValue placeholder="Any airline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any airline</SelectItem>
            {filters.airline && !airlines.some(([c]) => c === filters.airline) && (
              <SelectItem value={filters.airline}>{filters.airline}</SelectItem>
            )}
            {airlines.map(([c, n]) => (
              <SelectItem key={c} value={c}>
                <span className="data-value">{c}</span> · {airlineName(c) ?? "Unknown"} ({n})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="f-ground" className="text-sm">
          Hide ground traffic
        </Label>
        <Switch id="f-ground" checked={filters.hideGround} onCheckedChange={(v) => set({ hideGround: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="f-emg" className="text-sm">
          Emergency squawks only
          <span className="data-value block text-[11px] text-destructive">7500 · 7600 · 7700</span>
        </Label>
        <Switch
          id="f-emg"
          checked={filters.emergencyOnly}
          onCheckedChange={(v) => set({ emergencyOnly: v })}
        />
      </div>
    </div>
  );
}
