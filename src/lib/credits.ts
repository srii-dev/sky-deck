import { AIRFRAMES_ATTRIBUTION } from "./airframes-client";

/*
 * Credits and data sources shown in the app. Keep this in step with the README's "Data sources and attribution"
 * section. The credit texts below are the wording each source asks for or publishes; licences are described
 * as the source states them. When a source or its terms change, update this file.
 */

export type CreditGroup = "Aircraft and flight data" | "Map" | "Fonts";

export interface CreditLink {
  label: string;
  href: string;
}

export interface CreditEntry {
  id: string;
  group: CreditGroup;
  name: string;
  usedFor: string;
  /** The credit line itself. */
  credit: string;
  /** Licence or terms, as the source describes them. */
  licence: string;
  links: CreditLink[];
}

export const CREDITS: readonly CreditEntry[] = [
  {
    id: "adsb-lol",
    group: "Aircraft and flight data",
    name: "adsb.lol",
    usedFor: "Live aircraft positions and search (main source)",
    credit: "Aircraft data from adsb.lol, a community-run ADS-B network.",
    licence: "Open data under the ODbL 1.0, as stated by adsb.lol.",
    links: [
      { label: "adsb.lol", href: "https://adsb.lol" },
      { label: "ODbL 1.0", href: "https://opendatacommons.org/licenses/odbl/1.0/" },
    ],
  },
  {
    id: "airplanes-live",
    group: "Aircraft and flight data",
    name: "airplanes.live",
    usedFor: "Live aircraft positions (backup source)",
    credit: "Aircraft data from airplanes.live, a community ADS-B network.",
    licence: "See airplanes.live's terms of use.",
    links: [
      { label: "airplanes.live", href: "https://airplanes.live" },
      { label: "Terms of use", href: "https://airplanes.live/terms-of-use/" },
    ],
  },
  {
    id: "routes",
    group: "Aircraft and flight data",
    name: "Flight routes",
    usedFor: "Origin and destination for a selected flight",
    credit: "Route data from the Virtual Radar Server standing-data project, served by adsb.lol.",
    licence: "CC0 1.0, as shown on the project's repository.",
    links: [
      { label: "standing-data", href: "https://github.com/vradarserver/standing-data" },
      { label: "adsb.lol copy", href: "https://github.com/adsblol/vrs-standing-data" },
    ],
  },
  {
    id: "airframes",
    group: "Aircraft and flight data",
    name: "Airframes",
    usedFor: "ACARS messages, loaded only when you ask",
    credit: AIRFRAMES_ATTRIBUTION,
    licence: "Pre-release API. See Airframes' terms; messages are received by volunteers.",
    links: [{ label: "airframes.io", href: "https://airframes.io" }],
  },
  {
    id: "awc",
    group: "Aircraft and flight data",
    name: "NOAA Aviation Weather Center",
    usedFor:
      "Airport weather (METAR, TAF), runways and elevation on airport pages; SIGMETs, AIRMETs and pilot reports on the map",
    credit: "Weather data from the NOAA Aviation Weather Center (aviationweather.gov).",
    licence:
      "US government data. Its data API page (read 2026-11-08) asks for small, infrequent requests, at most 100 a minute, with a custom User-Agent, and does not allow calls from other websites' pages, so SkyDeck calls it from its server and caches the answers. The page states no licence, attribution wording or commercial-use rule.",
    links: [
      { label: "aviationweather.gov", href: "https://aviationweather.gov" },
      { label: "Data API usage notes", href: "https://aviationweather.gov/data/api/" },
    ],
  },
  {
    id: "rainviewer",
    group: "Aircraft and flight data",
    name: "RainViewer",
    usedFor: "Precipitation radar on the map, with a timeline of past frames",
    credit: "Radar data from RainViewer (rainviewer.com).",
    licence:
      "Free for personal and educational use only, with no availability guarantee, as its API page states (read 2026-11-08). It asks for the source to be named with a link. SkyDeck is a non-commercial hobby project; this would need to be revisited before any commercial use.",
    links: [
      { label: "rainviewer.com", href: "https://www.rainviewer.com/" },
      { label: "RainViewer API", href: "https://www.rainviewer.com/api.html" },
    ],
  },
  {
    id: "iem-echo-tops",
    group: "Aircraft and flight data",
    name: "Iowa Environmental Mesonet",
    usedFor: "Echo tops (storm height) over the US",
    credit:
      "Echo-top imagery from the Iowa Environmental Mesonet (Iowa State University), built from NEXRAD radar.",
    licence:
      "NEXRAD data are US government data. The Mesonet's own disclaimer page was NOT read in full (2026-11-08), so its terms for this use are not confirmed.",
    links: [{ label: "mesonet.agron.iastate.edu", href: "https://mesonet.agron.iastate.edu" }],
  },
  {
    id: "faa-nas",
    group: "Aircraft and flight data",
    name: "FAA NAS Status",
    usedFor: "Airport delays, ground delay programs and closure notices",
    credit: "Airport status from the FAA National Airspace System Status service.",
    licence:
      "US government data. The NAS Status site and its XML feed (read 2026-11-08) state no licence, rate limit or attribution wording; the site links only to FAA privacy, accessibility and contact pages. SkyDeck reads the feed from its server and caches it for a minute.",
    links: [{ label: "nasstatus.faa.gov", href: "https://nasstatus.faa.gov" }],
  },
  {
    id: "atis-info",
    group: "Aircraft and flight data",
    name: "atis.info",
    usedFor: "Current digital ATIS text on airport pages",
    credit: "Digital ATIS text from atis.info (a third-party service titled FAA Digital ATIS).",
    licence:
      "atis.info documents its API but states no licence, terms or attribution wording (page and API docs read 2026-11-08). It is a small third-party service, so SkyDeck reads it from its server, caches answers for a few minutes and shows ATIS as information only.",
    links: [{ label: "atis.info", href: "https://atis.info" }],
  },
  {
    id: "faa-airspace",
    group: "Aircraft and flight data",
    name: "FAA airspace data",
    usedFor:
      "Class B, C and D airspace and special use areas (restricted, prohibited, warning, alert, MOA)",
    credit: "Airspace data from the FAA (FAA open data on ArcGIS).",
    licence:
      "US government data. The FAA's terms for these services were NOT read (2026-11-09); only the layer metadata and real answers were checked. The service limits all callers together to 6,000 request units a minute, so SkyDeck asks it through its server and caches answers for 12 hours. Boundaries are simplified. Educational only, not for flight planning.",
    links: [{ label: "FAA open data", href: "https://adds-faa.opendata.arcgis.com/" }],
  },
  {
    id: "ourairports",
    group: "Aircraft and flight data",
    name: "OurAirports",
    usedFor: "The airport list for reachable airports",
    credit: "Airport data from OurAirports.",
    licence: "Public domain (Unlicense).",
    links: [{ label: "OurAirports data", href: "https://ourairports.com/data/" }],
  },
  {
    id: "openfreemap",
    group: "Map",
    name: "OpenFreeMap and OpenStreetMap",
    usedFor: "The Dark and Light base maps",
    credit: "OpenFreeMap, © OpenMapTiles, Data from OpenStreetMap.",
    licence: "OpenStreetMap data is available under the ODbL 1.0.",
    links: [
      { label: "OpenFreeMap", href: "https://openfreemap.org" },
      { label: "OpenMapTiles", href: "https://openmaptiles.org" },
      { label: "OpenStreetMap copyright", href: "https://www.openstreetmap.org/copyright" },
    ],
  },
  {
    id: "esri",
    group: "Map",
    name: "Esri World Imagery",
    usedFor: "The Satellite base map",
    credit: "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
    licence: "Provided under the Esri Master License Agreement.",
    links: [
      {
        label: "World Imagery",
        href: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
      },
    ],
  },
  {
    id: "terrain",
    group: "Map",
    name: "Terrain tiles",
    usedFor: "3D terrain and the ground height used by the glide ring",
    credit:
      "Mapzen Terrain Tiles on the AWS Open Data registry. Elevation sources include USGS (3DEP, SRTM, GMTED2010), ETOPO1, EU-DEM, ArcticDEM and national datasets from Australia, Austria, Canada, Mexico, New Zealand, Norway and the UK. 3DEP and SRTM data courtesy of the U.S. Geological Survey.",
    licence:
      "Each elevation source has its own terms, listed in the attribution document. Elevation data is not for navigation.",
    links: [
      { label: "Terrain Tiles on AWS", href: "https://registry.opendata.aws/terrain-tiles/" },
      {
        label: "Full attribution list",
        href: "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
      },
    ],
  },
  {
    id: "fonts",
    group: "Fonts",
    name: "Chakra Petch and JetBrains Mono",
    usedFor: "The app's typefaces, served from this site",
    credit:
      "Chakra Petch (Cadson Demak) and JetBrains Mono (JetBrains), copied from Google Fonts and served by SkyDeck itself.",
    licence: "SIL Open Font License 1.1, which allows this use.",
    links: [
      { label: "Chakra Petch", href: "https://fonts.google.com/specimen/Chakra+Petch" },
      { label: "JetBrains Mono", href: "https://fonts.google.com/specimen/JetBrains+Mono" },
    ],
  },
];

export const CREDIT_GROUPS: readonly CreditGroup[] = ["Aircraft and flight data", "Map", "Fonts"];

export const CREDITS_DISCLAIMER =
  "SkyDeck is for education and hobby use. It is not for navigation, flight planning, or any operational or safety purpose. Data may be delayed, incomplete or wrong. Each source has its own terms: check them before deploying publicly or commercially.";
