// Icon shape per aircraft (Phase 12a): the category (kind) decides colour grouping, alerts and panels, the shape adds a
// few type-specific silhouettes on the 2D map without changing the category. Browser- and server-safe.
import { KIND_LABELS, type AircraftKind } from "./aircraft-kind";

export type IconShape =
  Exclude<AircraftKind, "generic"> | "quad" | "regional" | "turboprop" | "fighter" | "generic";

export const SHAPE_LABELS: Record<IconShape, string> = {
  ...KIND_LABELS,
  widebody: "Twin-engine heavy",
  quad: "Four-engine heavy",
  regional: "Rear-engine jet",
  turboprop: "Turboprop",
  fighter: "Military jet",
};

/** Four-engine jets that are drawn with four engines. */
const QUAD = /^(B74\d|A38\d|A34\d|A124|A225|C5M?$|IL96|IL76|C17|B52|K35R|B70\d|VC10)/;
/** Jets with engines on the rear fuselage and a T-tail or high tail. */
const REAR_ENGINE =
  /^(CRJ\d|CRJX|E13\d|E14\d|E145|MD8\d|MD9\d|DC9|B717|B712|F70|F100|RJ\d\d|B46\d)/;
/** Twin turboprops (straight wing, propellers). Single-engine light aircraft keep the light icon. */
const TURBOPROP =
  /^(AT4\d|AT7\d|ATP|DH8[A-D]|SF34|SB20|JS3\d|JS41|E110|E120|B190|D328|F50|F27|DHC6|DHC7|C130|C30J|C212|CN35|L410|Y12|A400|SW4|P3)/;
/** Fighters and trainers, only for aircraft with no category of their own. */
const FIGHTER =
  /^(F16|F15|F18[HS]?|F35|F22|F14|F4|F5|EUFI|RFAL|GRIF|TORN|A10|T38|HAWK|M346|SU(25|27|30|34|35)|MG(29|31)|MIR[2F]?)$/;

export function iconShape(kind: AircraftKind, type: string | null | undefined): IconShape {
  const t = type?.trim().toUpperCase();
  if (!t) return kind;
  if (kind === "widebody" && QUAD.test(t)) return "quad";
  if (kind === "narrowbody" && REAR_ENGINE.test(t)) return "regional";
  if (kind === "light" && TURBOPROP.test(t)) return "turboprop";
  if (kind === "generic" && FIGHTER.test(t)) return "fighter";
  return kind;
}

const cache = new Map<string, IconShape>();
/** Same as iconShape, remembered: the map asks for it for every aircraft on every frame. */
export function iconShapeCached(kind: AircraftKind, type: string | null | undefined): IconShape {
  const key = kind + "|" + (type ?? "");
  let s = cache.get(key);
  if (!s) {
    s = iconShape(kind, type);
    if (cache.size > 2000) cache.clear();
    cache.set(key, s);
  }
  return s;
}
