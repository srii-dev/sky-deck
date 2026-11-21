/*
 * Give keyboard focus back to the button that opened a dialog. Radix does this only for a <DialogTrigger>; our dialogs
 * are opened from state (a toolbar button, a shortcut, another dialog), so without this focus fell to the page body on
 * close. Spread onto <DialogContent>: the element focused when the dialog opens is remembered per dialog and focused
 * again when it closes, if it is still on the page.
 */
const openers = new WeakMap<EventTarget, HTMLElement>();

export const returnFocus = {
  onOpenAutoFocus(event: Event) {
    const active = document.activeElement;
    if (event.currentTarget && active instanceof HTMLElement && active !== document.body) {
      openers.set(event.currentTarget, active);
    }
  },
  onCloseAutoFocus(event: Event) {
    const opener = event.currentTarget ? openers.get(event.currentTarget) : undefined;
    if (opener?.isConnected) {
      event.preventDefault();
      opener.focus();
    }
  },
};
