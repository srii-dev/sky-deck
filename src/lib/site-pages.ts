/*
 * Help and FAQ (Phase 23a), the press and about kit (23h) and the feedback links (23b). Text is data so a test can
 * check it, like the legal pages. Written from what the app does today; keep it in step with the README.
 */
import { APP_NAME, REPO_URL } from "@/config/brand";
import { CREDITS } from "./credits";
import type { LegalSection } from "./legal-content";

export interface TextPage {
  path: string;
  navLabel: string;
  title: string;
  description: string;
  /** ISO date the text was last changed. */
  updated: string;
  sections: LegalSection[];
}

const UPDATED = "2026-11-10";

/** Where visitors report a problem or send an idea: the project's GitHub issues, which has its own spam protection. */
export const FEEDBACK_URL = REPO_URL + "/issues/new/choose";
export const BUG_URL = REPO_URL + "/issues/new?template=bug_report.md";

export const HELP_PAGE: TextPage = {
  path: "/help",
  navLabel: "Help",
  title: "Help and FAQ",
  description:
    "How to read the " + APP_NAME + " map, where the data comes from and what its limits are.",
  updated: UPDATED,
  sections: [
    {
      heading: "Reading the map",
      paragraphs: [
        "Each aircraft is an icon that points the way it is heading. The colour shows its altitude, from warm (low) to cool (high); the key at the bottom left shows the scale. The shape shows the kind of aircraft: light aircraft, turboprop, rear-engine jet, narrowbody, twin-engine or four-engine heavy, business jet, military jet, helicopter, glider, balloon, drone and ground vehicle. The Aircraft types key lists them.",
        "Click an aircraft to open its panel: route, altitude, speed, vertical rate, registration, type, a Flight facts card with the phase of flight and time to the destination, charts, a trail you can download, and optional ACARS messages. The trail builds up from live positions while you watch.",
        "Blue and coloured outlines are airspace areas. Grey blobs on the ground are where aircraft are parked or taxiing close together.",
      ],
    },
    {
      heading: "Where the data comes from",
      paragraphs: [
        "Aircraft positions come from volunteers who receive ADS-B broadcasts, through adsb.lol (and airplanes.live as a backup). Weather comes from the Aviation Weather Center and RainViewer radar, airport status from the FAA, airspace from FAA open data, and the map from OpenFreeMap, Esri and AWS. The Credits and data sources link in the footer lists every source with its licence.",
      ],
    },
    {
      heading: "What the limits are",
      paragraphs: [
        "Not every aircraft is shown. Only aircraft that broadcast are visible, coverage depends on volunteers' receivers, and some operators block or filter their aircraft. Positions can be several seconds late; the map draws aircraft a few seconds in the past on purpose so they glide instead of jumping.",
        "Routes come from a public callsign database that can be weeks old, so a route can be missing or wrong. When the route does not fit where the aircraft is, the page hides it and says so. Stages, distances, arrival times and glide ranges are estimates from a straight line and the current speed.",
        APP_NAME +
          " is for education and hobby use. Never use it for navigation, flight planning or safety decisions.",
      ],
    },
    {
      heading: "Questions people ask",
      paragraphs: [
        "Why does it say Live data is busy? The free data sources limit how often they can be asked. The page retries by itself and recovers in a few seconds; reloading repeatedly makes it worse.",
        "Why is a flight I know about missing? It may not be broadcasting, may be outside the area the map has loaded, or may be filtered by its operator. Search by callsign, registration or airport at the top of the page.",
        "What do the squawk codes 7500, 7600 and 7700 mean? Hijack, radio failure and general emergency. Aircraft sending them are highlighted and listed in a banner.",
        "How do I get alerts? Open the Watchlist (star), add a flight, aircraft or airport, or create a rule such as any military aircraft near an airport. Alerts appear while the page is open.",
        "Can I use it on my phone? Yes. Open it in your browser and use your browser's Install or Add to Home Screen option. It needs a connection to show live aircraft.",
        "How do I delete what the app remembers? Settings, then Delete my saved data, removes everything stored in your browser. If you created an account, the account dialog has Delete my account. The Privacy page explains what is stored.",
      ],
    },
    {
      heading: "Something wrong, or an idea?",
      paragraphs: [
        "Report a problem or send an idea on the project's GitHub page (a free GitHub account is needed): " +
          FEEDBACK_URL +
          ". Please do not put private details in a public report.",
      ],
    },
  ],
};

const creditLines = CREDITS.map((c) => c.name + ": " + c.credit);

export const PRESS_PAGE: TextPage = {
  path: "/press",
  navLabel: "Press kit",
  title: "Press and about kit",
  description:
    "A short description, key facts, colours and attribution wording for " + APP_NAME + ".",
  updated: UPDATED,
  sections: [
    {
      heading: "In one sentence",
      paragraphs: [
        APP_NAME +
          " is a free, non-commercial hobby project that shows live aircraft on a 3D map, with trails, weather, airspace, alerts and learning tools.",
      ],
    },
    {
      heading: "In a paragraph",
      paragraphs: [
        APP_NAME +
          " shows aircraft that broadcast their position (ADS-B) on a 3D terrain map in the browser. You can search by callsign, registration or airport, follow an aircraft, watch its trail and phase of flight, set alert rules, replay the last half hour, and install it like an app. It is made by one student, has no advertising, keeps most of its data in your own browser, and is for education and hobby use only.",
      ],
    },
    {
      heading: "Key facts",
      paragraphs: [
        "Free, no account needed. Works in a modern browser on phones, tablets and computers. Source code is public at " +
          REPO_URL +
          ". Not an official flight tracker and not for navigation or safety.",
      ],
    },
    {
      heading: "Logo and colours",
      paragraphs: [
        "The app icon (an amber aircraft on a dark tile) is at /icons/icon-512.png (512 pixels) and /icons/icon-192.png. Colours: background #0f161d, amber #f5b83d. Typefaces: Chakra Petch and JetBrains Mono (SIL Open Font License). There is no separate wordmark file and there are no official screenshots yet; take your own and credit the data sources below.",
      ],
    },
    {
      heading: "Attribution wording",
      paragraphs: [
        "If you show the map or its data, please credit the sources it is built on. The full list with licences is in the Credits and data sources dialog; these are the credit lines:",
        ...creditLines,
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        "Questions and requests: open an issue on the project's GitHub page (" +
          FEEDBACK_URL +
          "). There is no press office.",
      ],
    },
  ],
};

export const SITE_PAGES: readonly TextPage[] = [HELP_PAGE, PRESS_PAGE];
