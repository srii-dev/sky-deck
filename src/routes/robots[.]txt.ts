import { createFileRoute } from "@tanstack/react-router";

import { indexingOff } from "@/lib/security-headers";
import { normalizeSiteUrl, robotsTxt } from "@/lib/site-meta";

/* robots.txt (Phase 15g): crawlers may read the pages but not the API; points at the sitemap when the site has an address. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const site =
          normalizeSiteUrl(process.env["SITE_URL"]) ??
          normalizeSiteUrl(new URL(request.url).origin);
        return new Response(robotsTxt(site, indexingOff(process.env["SITE_INDEXING"])), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
