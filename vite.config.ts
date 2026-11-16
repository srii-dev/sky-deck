// Plain Vite config for TanStack Start on Cloudflare Workers.
// It replaces @lovable.dev/vite-tanstack-config; the settings below are the ones that package applied
// outside Lovable's own sandbox.
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";

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
      ],
      ignoreOutdatedRequests: true,
    },
    server: { host: "::", port: 8080 },
    plugins: [
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
      ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
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
