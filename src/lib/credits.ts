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
    usedFor: "The app's typefaces, loaded from Google Fonts",
    credit: "Chakra Petch and JetBrains Mono, served by Google Fonts.",
    licence: "Open-licensed fonts (SIL Open Font License).",
    links: [
      { label: "Chakra Petch", href: "https://fonts.google.com/specimen/Chakra+Petch" },
      { label: "JetBrains Mono", href: "https://fonts.google.com/specimen/JetBrains+Mono" },
    ],
  },
];

export const CREDIT_GROUPS: readonly CreditGroup[] = ["Aircraft and flight data", "Map", "Fonts"];

export const CREDITS_DISCLAIMER =
  "SkyDeck is for education and hobby use. It is not for navigation, flight planning, or any operational or safety purpose. Data may be delayed, incomplete or wrong. Each source has its own terms: check them before deploying publicly or commercially.";
