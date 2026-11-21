// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { returnFocus } from "@/lib/return-focus";

function eventOn(target: EventTarget): Event {
  const e = new Event("focusScope", { cancelable: true });
  Object.defineProperty(e, "currentTarget", { value: target });
  return e;
}

describe("returnFocus", () => {
  it("focuses the element that was focused when the dialog opened, and stops Radix from moving focus", () => {
    const button = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(button, content);
    button.focus();

    returnFocus.onOpenAutoFocus(eventOn(content));
    (document.activeElement as HTMLElement).blur();
    const close = eventOn(content);
    returnFocus.onCloseAutoFocus(close);

    expect(document.activeElement).toBe(button);
    expect(close.defaultPrevented).toBe(true);
  });

  it("leaves the default alone when the opener is gone or was never recorded", () => {
    const button = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(button, content);
    button.focus();
    returnFocus.onOpenAutoFocus(eventOn(content));
    button.remove();

    const close = eventOn(content);
    returnFocus.onCloseAutoFocus(close);
    expect(close.defaultPrevented).toBe(false);

    const other = eventOn(document.createElement("div"));
    returnFocus.onCloseAutoFocus(other);
    expect(other.defaultPrevented).toBe(false);
  });
});
