export interface CreditEntry {
  label: string;
  name: string;
  url: string;
  note?: string;
}

export const DATA_DISCLAIMER =
  "Community data. Positions may be delayed or incomplete. Educational estimates only. Not for operational or safety use.";

export const DATA_CREDITS: readonly CreditEntry[] = [
  {
    label: "Aircraft positions & routes",
    name: "adsb.lol",
    url: "https://adsb.lol",
    note: "Open Database License (ODbL 1.0)",
  },
  {
    label: "Aircraft positions fallback",
    name: "airplanes.live",
    url: "https://airplanes.live",
  },
  {
    label: "Aircraft positions fallback",
    name: "OpenSky Network",
    url: "https://opensky-network.org",
  },
  {
    label: "Map data",
    name: "OpenStreetMap contributors via OpenFreeMap",
    url: "https://openfreemap.org",
  },
  {
    label: "Satellite imagery",
    name: "Esri",
    url: "https://www.esri.com",
    note: "Imagery © Esri, Vantor, Earthstar Geographics",
  },
  {
    label: "Terrain",
    name: "Mapzen / AWS Terrain Tiles",
    url: "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
  },
];

