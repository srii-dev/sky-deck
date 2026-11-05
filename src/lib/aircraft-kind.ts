// Aircraft category classification (browser- and server-safe).
// 1) ADS-B emitter category (A1–C7) when present, 2) ICAO type-code heuristics, 3) generic.

export type AircraftKind =
  | "light"
  | "narrowbody"
  | "widebody"
  | "bizjet"
  | "helicopter"
  | "glider"
  | "balloon"
  | "drone"
  | "ground"
  | "generic";

export interface KindInfo {
  kind: AircraftKind;
  label: string;
}

export const KIND_LABELS: Record<AircraftKind, string> = {
  light: "Light aircraft",
  narrowbody: "Narrowbody jet",
  widebody: "Heavy jet",
  bizjet: "Business jet",
  helicopter: "Helicopter",
  glider: "Glider",
  balloon: "Balloon",
  drone: "Drone",
  ground: "Ground vehicle",
  generic: "Aircraft",
};

/** ADS-B emitter categories (DO-260B). A0/B0/C0 = "no information" → fall through. */
const EMITTER: Record<string, KindInfo> = {
  A1: { kind: "light", label: "Light aircraft" },
  A2: { kind: "bizjet", label: "Small aircraft" },
  A3: { kind: "narrowbody", label: "Large jet" },
  A4: { kind: "narrowbody", label: "High-vortex large jet" },
  A5: { kind: "widebody", label: "Heavy jet" },
  A6: { kind: "generic", label: "High-performance aircraft" },
  A7: { kind: "helicopter", label: "Helicopter" },
  B1: { kind: "glider", label: "Glider" },
  B2: { kind: "balloon", label: "Lighter-than-air" },
  B3: { kind: "generic", label: "Parachutist" },
  B4: { kind: "light", label: "Ultralight" },
  B6: { kind: "drone", label: "Drone (UAV)" },
  B7: { kind: "generic", label: "Space vehicle" },
  C1: { kind: "ground", label: "Emergency vehicle" },
  C2: { kind: "ground", label: "Service vehicle" },
  C3: { kind: "generic", label: "Ground obstacle" },
  C4: { kind: "generic", label: "Ground obstacle" },
  C5: { kind: "generic", label: "Ground obstacle" },
};

const TYPE_RULES: [RegExp, KindInfo][] = [
  [/^(BALL|SHIP|GBAL)$/, { kind: "balloon", label: "Balloon" }],
  [
    /^(GLID|ASK\d|ASW\d|ASG\d|ASH\d|DG\d|LS\d|DUOD|ARCP|NIMB|VENT|DISC)/,
    { kind: "glider", label: "Glider" },
  ],
  [/^(UAV|Q\d|RQ\d|MQ\d|HRON|TB2)/, { kind: "drone", label: "Drone" }],
  [/^(GND|SERV|TWR|EMER)$/, { kind: "ground", label: "Ground vehicle" }],
  [
    /^(R22|R44|R66|EC\d\d|AS\d\d|H1\d\d|H160|H175|A109|A119|A139|A149|A169|A189|B06|B47G|B212|B407|B412|B429|B430|B505|S76|S92|S61|H60|UH1|UH60|H47|CH47|H64|BK17|MD52|MD60|MD90H|EH10|NH90|PUMA|LYNX|ALO3|GAZL|EXPL|K32|MI8|MI17|MI24|MI26|KMAX|V22)/,
    { kind: "helicopter", label: "Helicopter" },
  ],
  [
    /^(A30\d|A310|A33\d|A34\d|A35\d|A38\d|B74\d|B76\d|B77\d|B77[LW]|B78\d|BLCF|MD11|DC10|L101|IL96|IL86|IL76|A124|A225|C5M?$|C17|KC10|K35R|A400|B52)/,
    { kind: "widebody", label: "Heavy jet" },
  ],
  [
    /^(C25[A-C]|C500|C501|C510|C525|C550|C551|C560|C56X|C650|C680|C68A|C700|C750|CL30|CL35|CL60|GLEX|GL5T|GL6T|GL7T|GL8T|GLF\d|G150|G200|G280|LJ\d\d|E50P|E55P|E545|E550|FA\d\d|FA[5-9]X|F2TH|F900|HA4T|H25[A-C]|PRM1|BE40|PC24|SF50|EA50|C30J)/,
    { kind: "bizjet", label: "Business jet" },
  ],
  [
    /^(AT4\d|AT7\d|ATP|DH8[A-D]|SF34|SB20|JS3\d|JS41|E110|E120|B190|D328|F50|F27|SW4|C212|CN35|AN\d\d|Y12|L410|DHC6|DHC7|C130|C30J|P3)/,
    { kind: "light", label: "Turboprop" },
  ],
  [
    /^(A31\d|A32\d|A3[12]N|A2\d\d|A19N|A20N|A21N|BCS\d|B71\d|B72\d|B73\d|B37M|B38M|B39M|B3XM|B75\d|E1\d\d|E7\d|E9\d|E2\d\d|E290|E295|CRJ\d|MD8\d|MD9\d|DC9|F70|F100|B46\d|RJ\d\d|C919|SU95|T204|T154|AR85|AR1\d|E3CF|E6CF|P8)/,
    { kind: "narrowbody", label: "Narrowbody jet" },
  ],
  [
    /^(C1\d\d|C2\d\d|C3\d\d|C4\d\d|C77R|C82R|C208|P28|PA\d\d|P32|P46|SR2\d|S22T|DA4\d|DA2\d|DA62|BE3\d|BE2\d|BE9\d|BE55|BE58|BE76|M20|PC12|PC6|PC21|TBM\d|DHC2|DHC3|AA5|RV\d|TB\d|AC11|G115|P68|TOBA|CH7|ULAC|EV97|PIVI|FDCT)/,
    { kind: "light", label: "Light aircraft" },
  ],
];

export function classifyAircraft(
  category: string | null | undefined,
  typeCode: string | null | undefined,
): KindInfo {
  const cat = category?.trim().toUpperCase();
  if (cat && EMITTER[cat]) return EMITTER[cat];
  const t = typeCode?.trim().toUpperCase();
  if (t) {
    for (const [re, info] of TYPE_RULES) if (re.test(t)) return info;
  }
  return { kind: "generic", label: KIND_LABELS.generic };
}

/** Kinds whose icon should stay unrotated when no heading is reported. */
export function keepUprightWithoutHeading(kind: AircraftKind): boolean {
  return kind === "balloon" || kind === "helicopter";
}
