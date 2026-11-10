import { useCallback, useEffect, useState } from "react";

import { DEFAULT_NOTIFY, loadNotify, storeNotify, type NotifyPrefs } from "@/lib/notify-prefs";

/* Message choices (Phase 22i). Read after the first render so the server and first paint match. */
export function useNotifyPrefs(): {
  prefs: NotifyPrefs;
  set: (key: keyof NotifyPrefs, value: boolean) => void;
} {
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY);
  useEffect(() => setPrefs(loadNotify()), []);
  const set = useCallback((key: keyof NotifyPrefs, value: boolean) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      storeNotify(next);
      return next;
    });
  }, []);
  return { prefs, set };
}
