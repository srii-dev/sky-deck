/*
 * Give keyboard focus back to the button that opened a dialog. Radix does this only for a <DialogTrigger>; our dialogs
 * are opened from state (a toolbar button, a shortcut, another dialog), so without this focus fell to the page body on
 * close. Spread onto <DialogContent>: the element focused when the dialog opens is remembered per dialog and focused
 * again when it closes, if it is still on the page. A dialog opened from inside another one (Settings → Account) closes
 * or a popover first, so its button is gone by then: focus goes back to whatever opened the outer one instead, when
 * the outer one spreads this too (a <PopoverContent> can).
 */
const openers = new WeakMap<EventTarget, HTMLElement[]>();

export const returnFocus = {
  onOpenAutoFocus(event: Event) {
    const active = document.activeElement;
    if (event.currentTarget && active instanceof HTMLElement && active !== document.body) {
      const outer = active.closest("[role=dialog]");
      openers.set(event.currentTarget, [active, ...((outer && openers.get(outer)) ?? [])]);
    }
  },
  onCloseAutoFocus(event: Event) {
    const chain = event.currentTarget ? openers.get(event.currentTarget) : undefined;
    const opener = chain?.find((el) => el.isConnected);
    if (opener) {
      event.preventDefault();
      opener.focus();
    }
  },
};
