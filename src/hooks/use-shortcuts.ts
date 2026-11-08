import { useEffect, useRef } from "react";

import { actionForKey, isTypingTarget, overlayOpen, type ShortcutAction } from "@/lib/shortcuts";

/**
 * Listen for the single-key shortcuts. The handler returns true when it used the key, which then
 * loses its browser default (for example "/" typing into a field). Keys are left alone while the
 * user is typing in a field or an overlay (dialog, popover, menu) is open.
 */
export function useShortcuts(enabled: boolean, handler: (action: ShortcutAction) => boolean) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const action = actionForKey(e);
      if (!action) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isTypingTarget(target) || overlayOpen(document)) return;
      if (handlerRef.current(action)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
