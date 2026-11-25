// Writes the README screenshots and banner to docs/images/ (dev-plan 15f), from the app running against the stub ADS-B
// provider (invented aircraft, never live data). See e2e/readme-images.spec.ts. Needs the map tile hosts to be reachable.
// Works the same in Git Bash, PowerShell and CI (no shell variable syntax). Run:  node scripts/make-readme-images.mjs
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  [
    "playwright",
    "test",
    "e2e/readme-images.spec.ts",
    "--project",
    "chromium",
    "--retries",
    "0",
    "--workers",
    "1",
    "--trace",
    "off",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, README_IMAGES: "1" },
  },
);
process.exit(result.status ?? 1);
