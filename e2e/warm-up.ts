/*
 * Warms the dev server before the tests (Phase 0h). On a cold `vite dev` the first page load fails server function calls
 * ("Invalid server function ID", HTTP 500) until the plugin has compiled them; retries used to hide that. This loads the
 * map page and waits (at most about 60 s) until a server function answers, so the tests start on a warm server.
 */
export default async function warmUp(config: { projects: { use: { baseURL?: string } }[] }) {
  const base = config.projects[0]?.use.baseURL ?? "http://localhost:4173";
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await fetch(base + "/", { signal: AbortSignal.timeout(20_000) });
      // A feed call with bad input still has to be understood by the server function layer: any answer that is not the
      // cold-start error (500 "Invalid server function ID") means the functions are compiled.
      const res = await fetch(base + "/_serverFn/probe-warm-up", {
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      if (!/Invalid server function ID/i.test(text)) return;
    } catch {
      /* the server is still starting */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
