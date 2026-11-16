import { createFileRoute } from "@tanstack/react-router";

import { pageMeta } from "@/lib/site-meta";
import { LegalPageView } from "@/components/skydeck/LegalPageView";
import { legalPage } from "@/lib/legal-content";

const page = legalPage("/disclaimer")!;

export const Route = createFileRoute("/disclaimer")({
  head: () => ({
    meta: pageMeta(
      page.title.includes("SkyDeck") ? page.title : page.title + " — SkyDeck",
      page.description,
    ),
  }),
  component: () => <LegalPageView page={page} />,
});
