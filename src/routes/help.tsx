import { createFileRoute } from "@tanstack/react-router";

import { LegalPageView } from "@/components/skydeck/LegalPageView";
import { HELP_PAGE as page } from "@/lib/site-pages";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: page.title + " — SkyDeck" },
      { name: "description", content: page.description },
    ],
  }),
  component: () => <LegalPageView page={page} />,
});
