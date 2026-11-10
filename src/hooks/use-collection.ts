import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Aircraft } from "@/lib/aircraft";
import {
  dayKey,
  emptyCollection,
  loadCollection,
  recordSelection,
  storeCollection,
  type Collection,
} from "@/lib/collection";

/*
 * Collection (Phase 13): remembers each aircraft type and registration the visitor opens, once per aircraft per visit,
 * and says so when an achievement is unlocked or a daily challenge is completed. Kept in this browser only.
 */
export function useCollection(selected: Aircraft | null): {
  collection: Collection;
  clear: () => void;
} {
  const [collection, setCollection] = useState<Collection>(() => emptyCollection());
  const ref = useRef(collection);
  ref.current = collection;
  const loaded = useRef(false);
  const counted = useRef(new Set<string>());

  // This browser's saved collection, read after the first render so the server and first paint match.
  useEffect(() => {
    const c = loadCollection();
    loaded.current = true;
    ref.current = c;
    setCollection(c);
  }, []);

  const hex = selected?.hex ?? null;
  useEffect(() => {
    if (!selected || !loaded.current || selected.hex.startsWith("mock-")) return;
    if (counted.current.has(selected.hex)) return;
    // Wait until the aircraft has a type or registration; the next update of the same aircraft tries again.
    if (!selected.type && !selected.registration) return;
    counted.current.add(selected.hex);
    const now = Date.now();
    const r = recordSelection(ref.current, selected, now, dayKey(now));
    if (r.next === ref.current) return;
    ref.current = r.next;
    setCollection(r.next);
    storeCollection(r.next);
    for (const a of r.unlocked) toast("Achievement: " + a.name, { description: a.description });
    for (const c of r.completed) toast("Challenge complete: " + c.title);
    // Only when a different aircraft is opened, or its type and registration arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex, selected?.type, selected?.registration]);

  const clear = useCallback(() => {
    const c = emptyCollection();
    counted.current.clear();
    ref.current = c;
    setCollection(c);
    storeCollection(c);
  }, []);

  return { collection, clear };
}
