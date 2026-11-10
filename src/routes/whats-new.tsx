import { createFileRoute } from "@tanstack/react-router";

import { LegalPageView } from "@/components/skydeck/LegalPageView";
import changelog from "../../CHANGELOG.md?raw";
import { parseChangelog } from "@/lib/changelog-parse";

/* What is new (Phase 23c), built from CHANGELOG.md when the app is built. */
const releases = parseChangelog(changelog);
const page = {
  title: "What's new",
  updated: "",
  sections: releases.flatMap((r) =>
    r.groups.map((g) => ({
      heading: r.heading + ": " + g.name,
      paragraphs: g.items,
    })),
  ),
};

export const Route = createFileRoute("/whats-new")({
  head: () => ({
    meta: [
      { title: "What's new — SkyDeck" },
      { name: "description", content: "The latest changes to SkyDeck." },
    ],
  }),
  component: () => <LegalPageView page={page} />,
});
