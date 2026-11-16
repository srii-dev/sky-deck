import { createFileRoute } from "@tanstack/react-router";

import { pageMeta } from "@/lib/site-meta";
import { LegalPageView } from "@/components/skydeck/LegalPageView";
import { PRESS_PAGE as page } from "@/lib/site-pages";

export const Route = createFileRoute("/press")({
  head: () => ({
    meta: pageMeta(page.title + " — SkyDeck", page.description),
  }),
  component: () => <LegalPageView page={page} />,
});
