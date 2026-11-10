// Inline SVG silhouettes (64×64, nose pointing north). No fill set so callers choose the color.
import type { IconShape } from "@/lib/aircraft-shape";

type Drawn = Exclude<IconShape, "generic">;

export const ICON_SVG: Record<Drawn, string> = {
  light:
    '<rect x="22" y="7" width="20" height="2.5" rx="1.2"/>' +
    '<path d="M32 9c2.2 0 3 2 3 4v8h21a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H35l-1 18h8a1.5 1.5 0 0 1 1.5 1.5V50a1.5 1.5 0 0 1-1.5 1.5H34l-2 4-2-4h-8A1.5 1.5 0 0 1 20.5 50v-2.5A1.5 1.5 0 0 1 22 46h8l-1-18H8a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h21v-8c0-2 .8-4 3-4z"/>',
  narrowbody:
    '<path d="M32 4c2 0 3 2.5 3 5v15l22 12.5V41l-22-6.5-.8 14L42 54.5V58l-10-2.8L22 58v-3.5l7.8-6-.8-14L7 41v-4.5L29 24V9c0-2.5 1-5 3-5z"/>' +
    '<rect x="15" y="31" width="4" height="7" rx="1.5"/><rect x="45" y="31" width="4" height="7" rx="1.5"/>',
  widebody:
    '<path d="M32 2c3 0 4.5 3 4.5 6v15L62 37v5l-25.5-7-.8 13.5L45 55v4l-13-3-13 3v-4l9.3-6.5-.8-13.5L2 42v-5l25.5-14V8c0-3 1.5-6 4.5-6z"/>' +
    '<rect x="15.5" y="22" width="6" height="13" rx="2.5"/><rect x="42.5" y="22" width="6" height="13" rx="2.5"/>',
  quad:
    '<path d="M32 2c3 0 4.5 3 4.5 6v15L62 37v5l-25.5-7-.8 13.5L45 55v4l-13-3-13 3v-4l9.3-6.5-.8-13.5L2 42v-5l25.5-14V8c0-3 1.5-6 4.5-6z"/>' +
    '<rect x="10.5" y="27" width="4" height="10" rx="1.8"/><rect x="19.5" y="21" width="4" height="10" rx="1.8"/>' +
    '<rect x="40.5" y="21" width="4" height="10" rx="1.8"/><rect x="49.5" y="27" width="4" height="10" rx="1.8"/>',
  bizjet:
    '<path d="M32 6c1.6 0 2.3 2.4 2.3 4.5V27l15 9v3.5l-15-4.5V48l7.5 5v3l-9.8-2-9.8 2v-3l7.5-5V35l-15 4.5V36l15-9V10.5C29.7 8.4 30.4 6 32 6z"/>' +
    '<rect x="24.5" y="38" width="4" height="8" rx="1.8"/><rect x="35.5" y="38" width="4" height="8" rx="1.8"/>',
  helicopter:
    '<rect x="30" y="2" width="4" height="60" rx="2" transform="rotate(45 32 32)"/>' +
    '<rect x="30" y="2" width="4" height="60" rx="2" transform="rotate(-45 32 32)"/>' +
    '<ellipse cx="32" cy="28" rx="8" ry="11"/>' +
    '<rect x="30.5" y="36" width="3" height="20" rx="1.5"/>' +
    '<rect x="25" y="53" width="14" height="3" rx="1.5"/>',
  glider:
    '<path d="M32 10c1.5 0 2.2 2 2.2 4v10.5H61v3.5H34.2l-1 22H39v3.5h-7l-7 0V50h5.8l-1-22H3v-3.5h26.8V14c0-2 .7-4 2.2-4z"/>',
  balloon:
    '<path d="M32 4c11 0 19 8 19 18 0 9-7 15-12 20l-1.5 4h-11L25 42C20 37 13 31 13 22 13 12 21 4 32 4z"/>' +
    '<rect x="27" y="49" width="10" height="8" rx="1.5"/>' +
    '<rect x="26.5" y="45" width="2" height="5"/><rect x="35.5" y="45" width="2" height="5"/>',
  drone:
    '<rect x="29.5" y="8" width="5" height="48" rx="2.5" transform="rotate(45 32 32)"/>' +
    '<rect x="29.5" y="8" width="5" height="48" rx="2.5" transform="rotate(-45 32 32)"/>' +
    '<circle cx="15" cy="15" r="8"/><circle cx="49" cy="15" r="8"/>' +
    '<circle cx="15" cy="49" r="8"/><circle cx="49" cy="49" r="8"/>' +
    '<path d="M32 22l7 8v10H25V30z"/>',
  regional:
    '<path d="M32 4c1.8 0 2.6 2.2 2.6 4.5V26l19 9.5V40l-19-5-.6 13 6 4.5V58l-7-1.8L25 58v-1.5l6-4.5-.6-13-19 5v-4.5l19-9.5V8.5C29.4 6.2 30.2 4 32 4z"/>' +
    '<rect x="24.5" y="42" width="3.5" height="10" rx="1.7"/><rect x="36" y="42" width="3.5" height="10" rx="1.7"/>',
  turboprop:
    '<path d="M32 5c1.7 0 2.5 2 2.5 4.2V24h24a1.8 1.8 0 0 1 1.8 1.8v3.2a1.8 1.8 0 0 1-1.8 1.8H34.5l-.7 18 6.2 4.2V56l-8-1.6L24 56v-3.2l6.2-4.2-.7-18H6a1.8 1.8 0 0 1-1.8-1.8v-3.2A1.8 1.8 0 0 1 6 24h24.5V9.2C29.5 7 30.3 5 32 5z"/>' +
    '<rect x="15" y="16" width="4.5" height="13" rx="2"/><rect x="44.5" y="16" width="4.5" height="13" rx="2"/>' +
    '<rect x="12" y="13" width="10.5" height="2" rx="1"/><rect x="41.5" y="13" width="10.5" height="2" rx="1"/>',
  fighter:
    '<path d="M32 3c1.4 0 2.2 2 2.2 4.5L35 20l14 16v5l-14-4.5-.5 7 4.5 4v3l-7-1.2L25 51v-3l4.5-4-.5-7L15 41v-5l14-16 .8-12.5C29.8 5 30.6 3 32 3z"/>',
  ground:
    '<rect x="20" y="16" width="24" height="38" rx="4"/>' +
    '<rect x="22" y="6" width="20" height="12" rx="3.5"/>' +
    '<rect x="16" y="20" width="4" height="9" rx="1.5"/><rect x="44" y="20" width="4" height="9" rx="1.5"/>' +
    '<rect x="16" y="41" width="4" height="9" rx="1.5"/><rect x="44" y="41" width="4" height="9" rx="1.5"/>',
};

export const LEGEND_SHAPES: Drawn[] = [
  "light",
  "turboprop",
  "regional",
  "narrowbody",
  "widebody",
  "quad",
  "bizjet",
  "fighter",
  "helicopter",
  "glider",
  "balloon",
  "drone",
  "ground",
];

export function svgMarkup(kind: Drawn, fill = "#fff"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="${fill}">${ICON_SVG[kind]}</svg>`;
}
