/*
 * About, privacy, terms and disclaimer pages (Phase 16e). The text is data so a test can check every page, and so
 * the privacy page stays in step with DATA.md. This is a draft written from what the code does; the owner must read it
 * before the site is made public, and replace the contact with a real one (see CONTACT_NOTE).
 */
import { APP_NAME, REPO_URL } from "@/config/brand";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalPage {
  path: "/about" | "/privacy" | "/terms" | "/disclaimer";
  navLabel: string;
  title: string;
  description: string;
  /** ISO date the text was last changed. */
  updated: string;
  sections: LegalSection[];
}

export const CONTACT_URL = REPO_URL + "/issues";
export const CONTACT_NOTE =
  "Questions, corrections and takedown requests: open an issue on the project's GitHub page. Do not put private details in a public issue; say that you want a private reply and a way to give one will be arranged.";

const UPDATED = "2026-11-09";

export const LEGAL_PAGES: readonly LegalPage[] = [
  {
    path: "/about",
    navLabel: "About",
    title: "About " + APP_NAME,
    description:
      APP_NAME + " is a free, non-commercial hobby project that shows live aircraft on a 3D map.",
    updated: UPDATED,
    sections: [
      {
        heading: "What it is",
        paragraphs: [
          APP_NAME +
            " shows aircraft that broadcast their position (ADS-B) on a map, with trails, filters, weather, airspace, alerts and some learning tools. It is a free, non-commercial hobby and learning project made by one student. It is not a company and has no staff or support desk.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "Aircraft positions come from community feeds (adsb.lol, with airplanes.live as a fallback), weather from public aviation sources, and map tiles from OpenFreeMap, Esri and AWS. The credits list, reachable from the footer of every page, names each source and its licence.",
        ],
      },
      {
        heading: "What it is not",
        paragraphs: [
          "It is not an official flight tracker, not endorsed by any airline, airport or authority, and not for navigation or safety. See the disclaimer.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [CONTACT_NOTE],
      },
    ],
  },
  {
    path: "/privacy",
    navLabel: "Privacy",
    title: "Privacy",
    description: "What " + APP_NAME + " stores, where, for how long, and how to delete it.",
    updated: UPDATED,
    sections: [
      {
        heading: "The short version",
        paragraphs: [
          APP_NAME +
            " works without an account and does not use advertising or tracking cookies. Most of what it remembers stays in your own browser. If you create an account, a small amount of data is stored for it.",
        ],
      },
      {
        heading: "Kept in your browser only",
        paragraphs: [
          "Settings and choices (units, theme, map style, layers, shortcuts), your last map position, saved views, recent searches, your watchlist and recently viewed flights, alert rules, the stage history of flights you track, and your collection of opened aircraft types and registrations are saved in this browser's local storage. They are not sent to us. Settings, then Delete my saved data, removes them, and Download my data gives you a copy.",
          "While the page is open it also keeps about the last 30 minutes of aircraft positions it received, in memory, for the replay. That is never written to disk or sent anywhere and disappears when you close or reload the page.",
        ],
      },
      {
        heading: "If you create an account",
        paragraphs: [
          "An account stores your email address and a password hash (we never see your password), an optional display name, your watchlist (up to 50 items) and your recently viewed flights (up to 15), so they follow you between devices. Accounts and data are provided by Supabase. In the account dialog, Delete my account removes all of it at once.",
        ],
      },
      {
        heading: "What our server sees",
        paragraphs: [
          "Our server fetches aircraft, weather, airport and route data for you and keeps answers in memory for seconds to hours. Looking up a flight's route sends its flight number to our server. Browser error reports (message, stack, page path) are written to the hosting platform's log. Your network address is used only as a temporary key to limit request rates; the app does not store it. The hosting platform and Supabase keep their own request logs under their own terms.",
        ],
      },
      {
        heading: "What other companies see",
        paragraphs: [
          "Your browser requests map tiles and imagery directly from OpenFreeMap, Esri and AWS, radar from RainViewer, and, only when you open it, ACARS messages from Airframes. Those providers can see your network address and the area you are viewing. If you send feedback, it goes to GitHub, where it is public. The status page asks the data providers whether they are answering, from our server, not from your browser. The fonts are served by this site, not by Google.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [CONTACT_NOTE],
      },
    ],
  },
  {
    path: "/terms",
    navLabel: "Terms",
    title: "Terms of use",
    description: "The terms for using " + APP_NAME + ".",
    updated: UPDATED,
    sections: [
      {
        heading: "Using the service",
        paragraphs: [
          "You may use " +
            APP_NAME +
            " for personal, educational and hobby purposes. Please do not overload it with automated requests, try to break or bypass its limits, or use it to harass or track a person.",
        ],
      },
      {
        heading: "No promises",
        paragraphs: [
          "The service is free and is provided as it is, with no promise that it is correct, complete, on time or always available, and it can change or stop at any time. To the extent the law allows, the maker is not liable for loss caused by using it. Nothing here limits rights that cannot be limited by law.",
        ],
      },
      {
        heading: "Third-party data",
        paragraphs: [
          "Data and map tiles come from other providers, each with its own terms and licences (see the credits). You must follow those terms too. Aircraft data is shown for information only and is not republished by this site beyond what the page shows you.",
        ],
      },
      {
        heading: "The source code",
        paragraphs: [
          "The project's source code is public on GitHub. Its licence is stated in the repository, and it does not change the terms of the data above.",
        ],
      },
      {
        heading: "Feedback you send",
        paragraphs: [
          "The only content visitors can send is feedback and bug reports, and they go to the project's public GitHub page, where GitHub's own terms apply. Anything you post there is public. Please do not include passwords, personal details or anything you do not want others to read. It is used to fix and improve the app and may be quoted or answered in public. To have your own post removed, edit or delete it on GitHub or ask in the same issue.",
        ],
      },
      {
        heading: "Complaints and takedown process",
        paragraphs: [
          "If you are a rights holder, an operator, an owner or a person shown here and you believe something should be removed or corrected, please say what it is, where you saw it (the page and what was on screen) and why it should change. Do not include more personal information than needed. " +
            CONTACT_NOTE,
          "What happens next: the request is read, and the maker will remove or correct what can be removed or corrected here as soon as practical, usually within a few days, and will say what was done. Data shown on the map comes from other providers; where the right fix is at the source, the answer will say so and point there. This describes a good-faith process by a student hobbyist, not a legal service level, and it is not legal advice.",
        ],
      },
    ],
  },
  {
    path: "/disclaimer",
    navLabel: "Disclaimer",
    title: "Disclaimer",
    description: APP_NAME + " is not for navigation, flight planning or safety decisions.",
    updated: UPDATED,
    sections: [
      {
        heading: "Not for operational or safety use",
        paragraphs: [
          APP_NAME +
            " is for education and hobby use only. Do not use it for navigation, flight planning, air traffic control, search and rescue, or any decision where being wrong could hurt someone.",
        ],
      },
      {
        heading: "Data can be wrong",
        paragraphs: [
          "Positions come from aircraft broadcasts received by volunteers. They can be late, missing, wrong or filtered, and some aircraft do not broadcast at all. Routes can be out of date. Stages, distances, arrival times, glide ranges and nearby-airport suggestions are estimates from a straight line and current speed, without winds or air traffic control. Weather and airspace are shown for context and are not official briefings.",
        ],
      },
      {
        heading: "No affiliation",
        paragraphs: [
          "Airline, airport and aircraft names are used only to identify what is shown. They belong to their owners, and no endorsement or connection is meant.",
        ],
      },
    ],
  },
];

export function legalPage(path: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.path === path);
}
