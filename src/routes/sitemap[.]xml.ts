import { createFileRoute } from "@tanstack/react-router";

import { normalizeSiteUrl, sitemapXml } from "@/lib/site-meta";

/* sitemap.xml (Phase 15g): the pages of the site, with the configured address or, without one, the address asked for. */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const site =
          normalizeSiteUrl(process.env["SITE_URL"]) ??
          normalizeSiteUrl(new URL(request.url).origin);
        if (!site) return new Response("Not found", { status: 404 });
        return new Response(sitemapXml(site), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
