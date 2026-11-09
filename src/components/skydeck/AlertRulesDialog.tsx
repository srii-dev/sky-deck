import { useMemo } from "react";
import { MapPin, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toRuleAircraft } from "@/hooks/use-alert-rules";
import type { Aircraft } from "@/lib/aircraft";
import type { AircraftKind } from "@/lib/aircraft-kind";
import { KIND_LABELS } from "@/lib/aircraft-kind";
import { parseRuleText, type PlaceResolver } from "@/lib/alert-rule-parser";
import type { RuleDraft } from "@/lib/alert-rule-draft";
import {
  countMatches,
  describeConditions,
  hasConditions,
  MAX_ALERT_RULES,
  type AlertRule,
  type RuleConditions,
} from "@/lib/alert-rules";

/* Alert rules (Phase 10b to 10e): a plain-English box, hand-set conditions, an area drawn on the map, and the list. */

const BIZ_KINDS: AircraftKind[] = ["widebody", "narrowbody", "bizjet", "light", "helicopter"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: readonly AlertRule[];
  aircraft: readonly Aircraft[];
  draft: RuleDraft;
  onDraft: (d: RuleDraft) => void;
  resolvePlace: PlaceResolver;
  onSave: () => void;
  onRemove: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDrawArea: () => void;
  alertsOn: boolean;
  parseNote: string[] | null;
  onParseNote: (notes: string[] | null) => void;
}

function numberOrUndefined(v: string): number | undefined {
  const t = v.trim();
  if (t === "") return undefined;
  const n = Number(t.split(",").join(""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

export function AlertRulesDialog(p: Props) {
  const c = p.draft.conditions;
  const set = (patch: Partial<RuleConditions>) => {
    const next: RuleConditions = { ...c, ...patch };
    // Remove keys that were cleared.
    for (const k of Object.keys(next) as (keyof RuleConditions)[]) {
      if (next[k] === undefined || (Array.isArray(next[k]) && (next[k] as unknown[]).length === 0))
        delete next[k];
    }
    p.onDraft({ ...p.draft, conditions: next });
  };
  const rows = useMemo(() => p.aircraft.map(toRuleAircraft), [p.aircraft]);
  const lo = c.altMinFt;
  const hi = c.altMaxFt;
  const rangeBad = lo !== undefined && hi !== undefined && lo > hi;
  const canSave = hasConditions(c) && !rangeBad && p.rules.length < MAX_ALERT_RULES;

  const understand = () => {
    const parsed = parseRuleText(p.draft.text, p.resolvePlace);
    p.onParseNote(
      parsed.errors.length > 0
        ? parsed.errors
        : [
            "Understood: " + parsed.understood.join("; ") + ".",
            ...(parsed.ignored.length
              ? ["Not understood (ignored): " + parsed.ignored.join(", ") + "."]
              : []),
          ],
    );
    if (parsed.ok) p.onDraft({ ...p.draft, conditions: parsed.conditions, name: parsed.name });
  };

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alert rules</DialogTitle>
          <DialogDescription>
            Get a message when an aircraft starts matching a rule. They are checked while this page
            is open, and only for aircraft the map has loaded.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2" aria-label="Describe a rule">
          <Label htmlFor="rule-text">Describe it in plain English</Label>
          <div className="flex gap-2">
            <Input
              id="rule-text"
              value={p.draft.text}
              placeholder="heavy jet below 5,000 ft within 40 nm of JFK"
              onChange={(e) => p.onDraft({ ...p.draft, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") understand();
              }}
            />
            <Button variant="outline" onClick={understand} disabled={p.draft.text.trim() === ""}>
              <Wand2 /> Understand
            </Button>
          </div>
          {p.parseNote && (
            <ul className="space-y-0.5 text-xs text-muted-foreground" aria-live="polite">
              {p.parseNote.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="space-y-3 rounded-md border border-border/60 p-3"
          aria-label="Rule conditions"
        >
          <h3 className="hud-label">Conditions (all must match)</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {BIZ_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={c.kinds?.includes(k) ?? false}
                  onCheckedChange={(v) => {
                    const cur = c.kinds ?? [];
                    set({ kinds: v === true ? [...cur, k] : cur.filter((x) => x !== k) });
                  }}
                />
                {KIND_LABELS[k]}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={c.military === true}
                onCheckedChange={(v) => set({ military: v === true ? true : undefined })}
              />
              Military
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rule-cs" className="text-xs">
                Flight starts with
              </Label>
              <Input
                id="rule-cs"
                value={c.callsignPrefix ?? ""}
                maxLength={8}
                onChange={(e) =>
                  set({ callsignPrefix: e.target.value.toUpperCase().trim() || undefined })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-min" className="text-xs">
                Above (ft)
              </Label>
              <Input
                id="rule-min"
                inputMode="numeric"
                value={c.altMinFt ?? ""}
                onChange={(e) => set({ altMinFt: numberOrUndefined(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-max" className="text-xs">
                Below (ft)
              </Label>
              <Input
                id="rule-max"
                inputMode="numeric"
                value={c.altMaxFt ?? ""}
                onChange={(e) => set({ altMaxFt: numberOrUndefined(e.target.value) })}
              />
            </div>
          </div>
          {rangeBad && (
            <p role="alert" className="text-xs text-destructive">
              The lowest altitude is above the highest.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            {c.area ? (
              <>
                <span>
                  Within {c.area.radiusNm} nm of {c.area.label}
                </span>
                <Button variant="ghost" size="sm" onClick={() => set({ area: undefined })}>
                  Remove area
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground">Anywhere the map is loaded</span>
            )}
            <Button variant="outline" size="sm" onClick={p.onDrawArea}>
              Draw an area on the map
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="rule-name" className="text-xs">
                Name (optional)
              </Label>
              <Input
                id="rule-name"
                value={p.draft.name}
                maxLength={50}
                placeholder={hasConditions(c) ? describeConditions(c) : ""}
                onChange={(e) => p.onDraft({ ...p.draft, name: e.target.value })}
              />
            </div>
            <Button onClick={p.onSave} disabled={!canSave}>
              Create rule
            </Button>
          </div>
          {hasConditions(c) && (
            <p className="text-xs text-muted-foreground">
              {countMatches(c, rows)} aircraft match this right now.
            </p>
          )}
        </section>

        <section className="space-y-2" aria-label="Your rules">
          <h3 className="hud-label">
            Your rules ({p.rules.length} of {MAX_ALERT_RULES})
          </h3>
          {!p.alertsOn && (
            <p className="text-xs text-amber-300">
              Alerts are switched off in the Watchlist dialog.
            </p>
          )}
          {p.rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules yet.</p>
          ) : (
            <ul className="space-y-1">
              {p.rules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="data-value truncate text-sm">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {describeConditions(r.conditions)} · {countMatches(r.conditions, rows)}{" "}
                      matching now
                    </div>
                  </div>
                  <Switch
                    checked={r.enabled}
                    aria-label={(r.enabled ? "Switch off " : "Switch on ") + r.name}
                    onCheckedChange={(v) => p.onToggle(r.id, v)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={"Delete rule " + r.name}
                    onClick={() => p.onRemove(r.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
