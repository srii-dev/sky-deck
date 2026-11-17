// Runs the end-to-end tests against the production build in Cloudflare's local runtime. Build first: bun run build
// Works the same in Git Bash, PowerShell and CI (no shell variable syntax). Extra arguments go to Playwright.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, E2E_TARGET: "worker" },
});
process.exit(result.status ?? 1);
