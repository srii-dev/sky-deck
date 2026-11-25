import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* Runs public/sw.js against a fake worker scope and checks which requests it touches (Phase 16c). */

const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

type Listener = (e: Record<string, unknown>) => void;

function load() {
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Response>();
  const deleted: string[] = [];
  const caches = {
    open: async () => ({
      addAll: async (urls: string[]) => urls.forEach((u) => store.set(u, new Response("x"))),
      put: async (r: Request, res: Response) => void store.set(new URL(r.url).pathname, res),
    }),
    match: async (r: Request | string) =>
      store.get(typeof r === "string" ? r : new URL(r.url).pathname),
    keys: async () => ["old-cache", "skydeck-shell-v1", "skydeck-shell-v2", "skydeck-shell-v3"],
    delete: async (k: string) => {
      deleted.push(k);
      return true;
    },
  };
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const windows: {
    url: string;
    navigate: (u: string) => Promise<void>;
    focus: () => Promise<void>;
  }[] = [];
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (n: string, l: Listener) => void (listeners[n] = l),
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => windows,
      openWindow: async (u: string) => void opened.push(u),
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) =>
        void shown.push({ title, options }),
    },
  };
  let netCalls = 0;
  let netFails = false;
  const fetchFn = async () => {
    netCalls += 1;
    if (netFails) throw new Error("offline");
    return new Response("net");
  };
  new Function("self", "caches", "fetch", source)(self, caches, fetchFn);
  const handle = async (url: string, init: { method?: string; mode?: string } = {}) => {
    let responded: Promise<Response> | null = null;
    const req = { url, method: init.method ?? "GET", mode: init.mode ?? "cors", clone: () => req };
    listeners["fetch"]!({
      request: req,
      respondWith: (p: Promise<Response>) => void (responded = p),
    });
    return responded ? await (responded as Promise<Response>) : null;
  };
  return {
    handle,
    store,
    deleted,
    setOffline: (v: boolean) => (netFails = v),
    net: () => netCalls,
    listeners,
    shown,
    opened,
    windows,
  };
}

describe("service worker", () => {
  it("leaves data requests, other sites and non-GET requests to the network", async () => {
    const sw = load();
    for (const url of [
      "https://app.test/api/health",
      "https://app.test/_serverFn/abc",
      "https://app.test/some/data.json",
      "https://tiles.example/a.png",
    ]) {
      expect(await sw.handle(url)).toBeNull();
    }
    expect(await sw.handle("https://app.test/assets/x.js", { method: "POST" })).toBeNull();
  });

  it("keeps built files after the first fetch and serves them without the network", async () => {
    const sw = load();
    const first = await sw.handle("https://app.test/assets/app-abc.js");
    expect(await first!.text()).toBe("net");
    // Let the copy be stored, then go offline.
    await new Promise((r) => setTimeout(r, 0));
    sw.setOffline(true);
    const second = await sw.handle("https://app.test/assets/app-abc.js");
    expect(await second!.text()).toBe("net");
    expect(sw.net()).toBe(1);
  });

  it("tries the network for pages and shows the offline page only when it fails", async () => {
    const sw = load();
    // Fill the cache with the precached files.
    await new Promise<void>((resolve) =>
      sw.listeners["install"]!({ waitUntil: (p: Promise<unknown>) => p.then(() => resolve()) }),
    );
    const online = await sw.handle("https://app.test/inspector", { mode: "navigate" });
    expect(await online!.text()).toBe("net");
    sw.setOffline(true);
    const offline = await sw.handle("https://app.test/inspector", { mode: "navigate" });
    expect(await offline!.text()).toBe("x");
    // The final address, not /offline.html (which the host redirects, and a redirect cannot answer a page load).
    expect(sw.store.has("/offline")).toBe(true);
    expect(sw.store.has("/offline.html")).toBe(false);
  });

  it("removes old caches when it activates", async () => {
    const sw = load();
    let done = false;
    await new Promise<void>((resolve) =>
      sw.listeners["activate"]!({
        waitUntil: (p: Promise<unknown>) =>
          p.then(() => {
            done = true;
            resolve();
          }),
      }),
    );
    expect(done).toBe(true);
    expect(sw.deleted.sort()).toEqual(["old-cache", "skydeck-shell-v1", "skydeck-shell-v2"]);
  });
});

describe("closed-page alerts (web push)", () => {
  const push = async (sw: ReturnType<typeof load>, json: unknown) => {
    let waited: Promise<unknown> | null = null;
    sw.listeners["push"]!({
      data: { json: () => (json === "bad" ? JSON.parse("{") : json) },
      waitUntil: (p: Promise<unknown>) => void (waited = p),
    });
    await waited;
  };
  const click = async (sw: ReturnType<typeof load>, url: unknown) => {
    let waited: Promise<unknown> | null = null;
    let closed = false;
    sw.listeners["notificationclick"]!({
      notification: { data: { url }, close: () => (closed = true) },
      waitUntil: (p: Promise<unknown>) => void (waited = p),
    });
    await waited;
    return closed;
  };

  it("shows the alert from the push payload", async () => {
    const sw = load();
    await push(sw, {
      title: "Heavies at JFK: UAL1",
      body: "B77W, 3,000 ft",
      tag: "rule-r1",
      url: "/?hex=a1b2c3",
    });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]!.title).toBe("Heavies at JFK: UAL1");
    expect(sw.shown[0]!.options["body"]).toBe("B77W, 3,000 ft");
    expect(sw.shown[0]!.options["tag"]).toBe("rule-r1");
    expect(sw.shown[0]!.options["data"]).toEqual({ url: "/?hex=a1b2c3" });
  });

  it("still shows something for an empty or broken payload, and never keeps another site's address", async () => {
    const sw = load();
    await push(sw, "bad");
    await push(sw, { title: "x", url: "https://evil.example/" });
    await push(sw, { title: "y", url: "//evil.example/" });
    expect(sw.shown[0]!.title).toBe("SkyDeck alert");
    expect(sw.shown[1]!.options["data"]).toEqual({ url: "/" });
    expect(sw.shown[2]!.options["data"]).toEqual({ url: "/" });
  });

  it("opens the aircraft on this site when clicked, reusing an open tab", async () => {
    const sw = load();
    expect(await click(sw, "/?hex=a1b2c3")).toBe(true);
    expect(sw.opened).toEqual(["https://app.test/?hex=a1b2c3"]);
    const went: string[] = [];
    sw.windows.push({
      url: "https://app.test/",
      focus: async () => undefined,
      navigate: async (u: string) => void went.push(u),
    });
    await click(sw, "https://evil.example/");
    expect(went).toEqual(["https://app.test/"]);
    expect(sw.opened).toHaveLength(1);
  });
});

describe("web app files", () => {
  it("has a manifest with the icons it names", () => {
    const m = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/manifest.webmanifest"), "utf8"),
    ) as { icons: { src: string; sizes: string }[]; start_url: string; display: string };
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons.length).toBeGreaterThanOrEqual(2);
    for (const i of m.icons) {
      const png = readFileSync(resolve(process.cwd(), "public" + i.src));
      // PNG signature, and the size in the header matches what the manifest says.
      expect([...png.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
      const [w] = i.sizes.split("x").map(Number);
      expect(png.readUInt32BE(16)).toBe(w);
    }
  });

  it("precaches only files that exist", () => {
    const m = /const PRECACHE = (\[[^\]]*\])/.exec(source);
    const list = JSON.parse(m![1]!.replace(/,\s*\]/, "]")) as string[];
    for (const f of list) {
      // The host serves public/offline.html at /offline.
      const file = f === "/offline" ? "/offline.html" : f;
      expect(() => readFileSync(resolve(process.cwd(), "public" + file))).not.toThrow();
    }
  });
});
