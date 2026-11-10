import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Aircraft } from "@/lib/aircraft";
import {
  addRule,
  evaluateRules,
  loadRules,
  newRuleState,
  removeRule,
  setRuleEnabled,
  storeRules,
  type AlertRule,
  type RuleAircraft,
  type RuleConditions,
  type RuleState,
} from "@/lib/alert-rules";

/*
 * Alert rules and their checking (Phase 10). The rules live in this browser. While the page is open, every aircraft
 * update is checked against the switched-on rules and a message appears when an aircraft starts matching one.
 * Nothing runs when the tab is closed (that needs web push and a backend, Phase 10f).
 */

export interface AlertRulesApi {
  rules: AlertRule[];
  add(draft: { name: string; conditions: RuleConditions }): "added" | "full" | "invalid";
  remove(id: string): void;
  setEnabled(id: string, enabled: boolean): void;
  reload(): void;
}

export function toRuleAircraft(a: Aircraft): RuleAircraft {
  return {
    hex: a.hex,
    callsign: a.callsign,
    registration: a.registration,
    type: a.type,
    kind: a.kind,
    lat: a.lat,
    lon: a.lon,
    altFt: a.altFt,
    onGround: a.onGround,
    squawk: a.squawk,
    military: a.military,
    seenPos: a.seenPos,
  };
}

export function useAlertRules(opts: {
  aircraft: readonly Aircraft[];
  /** The global alerts switch (the same one as for watched items). */
  enabled: boolean;
  onShow: (hex: string) => void;
}): AlertRulesApi {
  const { aircraft, enabled, onShow } = opts;
  const [rules, setRules] = useState<AlertRule[]>([]);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const stateRef = useRef<RuleState>(newRuleState());
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  const reload = useCallback(() => setRules(loadRules()), []);
  // Read this browser's rules after the first render (not during server rendering).
  useEffect(() => reload(), [reload]);

  const persist = useCallback((next: AlertRule[]) => {
    setRules(next);
    storeRules(next);
  }, []);

  useEffect(() => {
    if (!enabled || rules.every((r) => !r.enabled)) {
      stateRef.current = newRuleState();
      return;
    }
    const r = evaluateRules(
      stateRef.current,
      rulesRef.current,
      aircraft.map(toRuleAircraft),
      Date.now(),
    );
    stateRef.current = r.state;
    for (const e of r.events) {
      const action = e.hex ? { label: "Show", onClick: () => onShowRef.current(e.hex) } : undefined;
      toast(e.title, { description: e.detail, ...(action ? { action } : {}), duration: 8000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, enabled]);

  const add = useCallback<AlertRulesApi["add"]>(
    (draft) => {
      const next = addRule(rulesRef.current, draft, Date.now());
      if (!next) return rulesRef.current.length >= 20 ? "full" : "invalid";
      persist(next);
      return "added";
    },
    [persist],
  );
  const remove = useCallback((id: string) => persist(removeRule(rulesRef.current, id)), [persist]);
  const setEnabled = useCallback(
    (id: string, on: boolean) => persist(setRuleEnabled(rulesRef.current, id, on)),
    [persist],
  );

  return { rules, add, remove, setEnabled, reload };
}
