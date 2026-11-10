import { createServerFn } from "@tanstack/react-start";

/*
 * The public address of the site (Phase 15g), from the optional SITE_URL server variable. It is not a secret.
 * Without it (no domain yet) pages simply get no canonical link.
 */
export const getSiteUrl = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    const { normalizeSiteUrl } = await import("./site-meta");
    return normalizeSiteUrl(process.env["SITE_URL"]);
  },
);
