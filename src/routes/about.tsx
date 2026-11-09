import { createFileRoute } from "@tanstack/react-router";

import { LegalPageView } from "@/components/skydeck/LegalPageView";
import { legalPage } from "@/lib/legal-content";

const page = legalPage("/about")!;

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: page.title.includes("SkyDeck") ? page.title : page.title + " — SkyDeck" },
      { name: "description", content: page.description },
    ],
  }),
  component: () => <LegalPageView page={page} />,
});
