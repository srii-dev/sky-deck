/*
 * Warms the dev server before the tests (Phase 0h). On a cold `vite dev` the first page loads fail server function
 * calls ("Invalid server function ID", HTTP 500) until the plugin has compiled them; retries used to hide that.
 * Every page render calls a server function (the root route's loader), so this loads the home page until it answers 200
 * without that error, at most about 60 s, and fails the run loudly if it never does.
 */
export default async function warmUp() {
  const base = `http://localhost:${process.env.E2E_PORT ?? 4173}`;
  const deadline = Date.now() + 60_000;
  let last = "no answer";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + "/", { signal: AbortSignal.timeout(25_000) });
      const text = await res.text();
      if (res.status === 200 && text.includes("<html") && !/Invalid server function ID/i.test(text))
        return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`The dev server at ${base} did not render the home page within 60 s (${last}).`);
}
