import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Node 25+ ships a global localStorage that shadows jsdom's (undefined without --localstorage-file); Node 22 rejects the flag.
    execArgv: process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")
      ? ["--no-experimental-webstorage"]
      : [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Only the Workers runtime has this module; a stand-in lets tests load the Durable Objects in src/server.
      "cloudflare:workers": path.resolve(__dirname, "./src/test/server-do-fake.ts"),
    },
  },
});
