// Builds a signed-distance-field plane silhouette so MapLibre can tint it per aircraft (icon-color)
// and draw a halo around the selected aircraft.

const SIZE = 64;
const RADIUS = 6; // px of distance encoded on each side of the edge

const PLANE: [number, number][] = [
  [32, 5], [35, 10], [35, 24], [58, 36], [58, 40], [35, 34.5], [34, 49], [42, 55], [42, 58.5],
  [32, 55.5], [22, 58.5], [22, 55], [30, 49], [29, 34.5], [6, 40], [6, 36], [29, 24], [29, 10],
];

export function buildPlaneSdf(): { width: number; height: number; data: Uint8Array } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  PLANE.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  const src = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const inside = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) inside[i] = src[i * 4 + 3] > 127 ? 1 : 0;

  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const me = inside[y * SIZE + x];
      let best = RADIUS;
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= SIZE) continue;
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= SIZE) continue;
          if (inside[yy * SIZE + xx] !== me) {
            const d = Math.sqrt(dx * dx + dy * dy) - 0.5;
            if (d < best) best = d;
          }
        }
      }
      const signed = me ? best : -best;
      const v = Math.max(0, Math.min(255, Math.round(192 + (signed / RADIUS) * 63)));
      const o = (y * SIZE + x) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = v;
    }
  }
  return { width: SIZE, height: SIZE, data: out };
}
