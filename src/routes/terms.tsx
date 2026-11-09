import { createFileRoute } from "@tanstack/react-router";

import { LegalPageView } from "@/components/skydeck/LegalPageView";
import { legalPage } from "@/lib/legal-content";

const page = legalPage("/terms")!;

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: page.title + " — SkyDeck" },
      { name: "description", content: page.description },
    ],
  }),
  component: () => <LegalPageView page={page} />,
});
