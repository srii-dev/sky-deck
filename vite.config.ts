// Plain Vite config for TanStack Start on Cloudflare Workers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { KEEPALIVE_CRON } from "./src/lib/supabase-keepalive.server";
import { PUSH_CRON } from "./src/server/push-cron";

export default defineConfig(({ command, mode }) => {
  // Every VITE_ variable is also defined for server code, where Vite does not fill import.meta.env itself.
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define: envDefine,
    css: { transformer: "lightningcss" as const },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        // Found only after the first page load (TanStack Start's client entry is virtual, so the dependency scan
        // never reaches them). Discovering them late makes Vite re-bundle and force a full reload on a cold start,
        // which aborts every module request of the first load (dev-plan 0h).
        "@tanstack/router-core",
        "@tanstack/router-core/isServer",
        "@tanstack/router-core/ssr/client",
        "seroval",
      ],
      ignoreOutdatedRequests: true,
    },
    server: {
      host: "::",
      port: 8080,
      // TanStack Start only accepts a server function call in development once the server side has compiled the
      // file that defines it. A browser tab left open across a restart, or a client-only component (the map is
      // lazy and never rendered on the server), can call one first and get "Invalid server function ID" (500).
      // Compiling every server function file right at start-up closes that window (dev-plan 0h).
      warmup: { ssrFiles: ["./src/lib/*.functions.ts"] },
    },
    plugins: [
      {
        // Vite serves workers with its HMR client imported, and that client reads `document` on every CSS update
        // (Tailwind sends several on a cold start), so the map worker threw "document is not defined" (dev-plan 0h).
        // The MapLibre worker is one self-contained file: serve it untouched in development.
        name: "skydeck:raw-map-worker",
        apply: "serve",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            // Only the worker's own request (?worker_file); the ?worker&url import in FlightMap.tsx must still get its URL.
            const [path, query = ""] = (req.url ?? "").split("?");
            if (
              !path?.endsWith("/maplibre-gl/dist/maplibre-gl-worker.mjs") ||
              !query.includes("worker_file")
            ) {
              return next();
            }
            res.setHeader("Content-Type", "text/javascript");
            res.end(
              readFileSync(
                fileURLToPath(import.meta.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs")),
              ),
            );
          });
        },
      },
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Same import-protection rules the old wrapper set: server/ folders and the server-only specifier must not be imported by browser code (*.server.* files are covered by TanStack Start's own defaults).
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper). Nitro builds from this.
        server: { entry: "server" },
      }),
      // Only the production build is a Worker; the dev server does not need Nitro.
      ...(command === "build"
        ? [
            nitro({
              defaultPreset: "cloudflare-module",
              // Daily Supabase keep-alive (plan item 18f) and the closed-page alert check (Phase 10f), each on its cron
              // trigger below. Each plugin ignores the other's cron.
              plugins: ["./src/server/keepalive.plugin.ts", "./src/server/push-cron.ts"],
              // Workers AI binding for the ACARS descriptions (src/lib/ai.server.ts reads it as AI). CI builds
              // without it (SKYDECK_AI_BINDING=off): wrangler dev needs a Cloudflare token for a remote binding.
              cloudflare: {
                // FeedHub, the shared feed cache (src/server/feed-hub.ts), AiHub, the shared AI service
                // (src/server/ai-hub.ts), and PushHub, the closed-page alert check (src/server/push-hub.ts), are
                // exported from the Worker entry here.
                exports: "./src/server/exports.cloudflare.ts",
                wrangler: {
                  durable_objects: {
                    bindings: [
                      { name: "FEED_HUB", class_name: "FeedHub" },
                      { name: "AI_HUB", class_name: "AiHub" },
                      { name: "PUSH_HUB", class_name: "PushHub" },
                    ],
                  },
                  // The Workers Free plan only offers SQLite-backed Durable Objects. Never edit a deployed tag.
                  migrations: [
                    { tag: "v1", new_sqlite_classes: ["FeedHub"] },
                    { tag: "v2", new_sqlite_classes: ["AiHub"] },
                    { tag: "v3", new_sqlite_classes: ["PushHub"] },
                  ],
                  // Daily Supabase keep-alive (src/server/keepalive.plugin.ts) and the closed-page alert check every two
                  // minutes (src/server/push-cron.ts; it does nothing until the VAPID keys and the service role key are
                  // set). The Free plan allows 5 cron triggers.
                  triggers: { crons: [KEEPALIVE_CRON, PUSH_CRON] },
                  ...(process.env["SKYDECK_AI_BINDING"] === "off" ? {} : { ai: { binding: "AI" } }),
                },
              },
            }),
          ]
        : []),
      react(),
    ],
    build: {
      rollupOptions: {
        output: {
          // The map library is large and changes rarely: its own file is cached by the browser across our releases (Phase 16d).
          manualChunks(id: string) {
            if (id.includes("node_modules/maplibre-gl")) return "maplibre";
            return undefined;
          },
        },
      },
    },
  };
});
