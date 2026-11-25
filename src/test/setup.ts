import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Node 25+ has its own global localStorage and sessionStorage. Without --localstorage-file they are undefined, and
// they can shadow jsdom's. vitest.config.ts turns Node's off with --no-experimental-webstorage where Node accepts
// that flag; this is the fallback for runs where the flag did not reach the test process (seen on Windows with
// Node 26): point both names back at the jsdom window's storage.
{
  const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
  for (const key of ["localStorage", "sessionStorage"] as const) {
    const own = dom?.window[key];
    if (own && globalThis[key] !== own) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: own });
    }
  }
}
