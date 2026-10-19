import type { Rect } from "../domain/scans";
export type Point = { x: number; y: number };
export type Transform = number[];
export function project(h: Transform, x: number, y: number): Point {
  const d = h[6] * x + h[7] * y + 1;
  return {
    x: (h[0] * x + h[1] * y + h[2]) / d,
    y: (h[3] * x + h[4] * y + h[5]) / d,
  };
}
/** Solve the projective mapping using four non-collinear correspondences. */
export function homography(from: Point[], to: Point[]): Transform {
  const rows: number[][] = [];
  from.forEach(({ x, y }, i) => {
    const { x: u, y: v } = to[i];
    rows.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    );
  });
  for (let i = 0; i < 8; i++) {
    let pivot = i;
    for (let k = i + 1; k < 8; k++)
      if (Math.abs(rows[k][i]) > Math.abs(rows[pivot][i])) pivot = k;
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    if (Math.abs(rows[i][i]) < 1e-9)
      throw new Error("Les repères ne permettent pas d’aligner cette feuille.");
    const v = rows[i][i];
    for (let j = i; j <= 8; j++) rows[i][j] /= v;
    for (let k = 0; k < 8; k++)
      if (k !== i) {
        const f = rows[k][i];
        for (let j = i; j <= 8; j++) rows[k][j] -= f * rows[i][j];
      }
  }
  return rows.map((r) => r[8]);
}
export const corners = ([x, y, w, h]: Rect): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
/** The normalized canvas uses x/2 and y/2; rounded A4 pixel dimensions must
 * not introduce another scale change when exporting or displaying a crop. */
export const normalizedScale = (width: number, height: number) =>
  width === Math.round(595.28 * 2) && height === Math.round(841.89 * 2)
    ? 2
    : width / 595.28;
const dark = (im: Raster, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= im.width || y >= im.height) return false;
  const i = (y * im.width + x) * 4;
  return (
    im.data[i] * 0.299 + im.data[i + 1] * 0.587 + im.data[i + 2] * 0.114 <
      110 && im.data[i + 3] > 128
  );
};
/** Search near a predicted corner for an isolated, filled square. */
export function findMarker(
  im: Raster,
  expected: Point,
  size: number,
): Point | null {
  const radius = Math.max(45, size * 6),
    seen = new Set<number>();
  let best: Point | null = null,
    cost = Infinity;
  const x0 = Math.max(0, Math.floor(expected.x - radius)),
    x1 = Math.min(im.width - 1, Math.ceil(expected.x + radius));
  const y0 = Math.max(0, Math.floor(expected.y - radius)),
    y1 = Math.min(im.height - 1, Math.ceil(expected.y + radius));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const seed = y * im.width + x;
      if (seen.has(seed) || !dark(im, x, y)) continue;
      const todo = [seed];
      seen.add(seed);
      let loX = x,
        hiX = x,
        loY = y,
        hiY = y,
        count = 0;
      for (let n = 0; n < todo.length; n++) {
        const k = todo[n],
          cx = k % im.width,
          cy = Math.floor(k / im.width);
        count++;
        loX = Math.min(loX, cx);
        hiX = Math.max(hiX, cx);
        loY = Math.min(loY, cy);
        hiY = Math.max(hiY, cy);
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          const nk = ny * im.width + nx;
          if (
            nx < x0 ||
            nx > x1 ||
            ny < y0 ||
            ny > y1 ||
            seen.has(nk) ||
            !dark(im, nx, ny)
          )
            continue;
          seen.add(nk);
          todo.push(nk);
        }
      }
      const w = hiX - loX + 1,
        h = hiY - loY + 1;
      if (
        w < size * 0.5 ||
        w > size * 1.7 ||
        h < size * 0.5 ||
        h > size * 1.7 ||
        count / (w * h) < 0.75 ||
        w / h < 0.75 ||
        w / h > 1.33
      )
        continue;
      const center = { x: (loX + hiX) / 2, y: (loY + hiY) / 2 };
      const distance = Math.hypot(center.x - expected.x, center.y - expected.y);
      if (distance < cost) {
        best = center;
        cost = distance;
      }
    }
  return best;
}
export function alignRaster(im: Raster, h: Transform, scale = 2): Raster {
  const width = Math.round(595.28 * scale),
    height = Math.round(841.89 * scale),
    data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = project(h, x / scale, y / scale),
        sx = Math.round(p.x),
        sy = Math.round(p.y);
      if (sx < 0 || sy < 0 || sx >= im.width || sy >= im.height) continue;
      const a = (y * width + x) * 4,
        b = (sy * im.width + sx) * 4;
      data[a] = im.data[b];
      data[a + 1] = im.data[b + 1];
      data[a + 2] = im.data[b + 2];
    }
  return { width, height, data };
}

/** Isolate the ink inside one digit box and centre it in MNIST's 28×28 space. */
export function digitTensor(
  im: Raster,
  rect: Rect,
  scale = 2,
): Float32Array | null {
  const [x, y, w, h] = rect.map((v) => v * scale);
  const pad = Math.max(3, Math.round(scale * 2.5));
  let left = Infinity,
    top = Infinity,
    right = -1,
    bottom = -1,
    count = 0;
  const pixels: Point[] = [];
  for (let yy = Math.ceil(y + pad); yy < y + h - pad; yy++)
    for (let xx = Math.ceil(x + pad); xx < x + w - pad; xx++)
      if (dark(im, xx, yy)) {
        pixels.push({ x: xx, y: yy });
        left = Math.min(left, xx);
        top = Math.min(top, yy);
        right = Math.max(right, xx);
        bottom = Math.max(bottom, yy);
        count++;
      }
  if (count < 7 || bottom - top < 5) return null;
  const bw = right - left + 1,
    bh = bottom - top + 1,
    s = 20 / Math.max(bw, bh),
    out = new Float32Array(784);
  const ox = (28 - bw * s) / 2,
    oy = (28 - bh * s) / 2;
  // Area accumulation retains narrow pen strokes during downsampling.
  for (const p of pixels) {
    const xx = ox + (p.x - left) * s,
      yy = oy + (p.y - top) * s;
    const x0 = Math.max(0, Math.floor(xx)),
      y0 = Math.max(0, Math.floor(yy));
    for (let y1 = y0; y1 <= Math.min(27, Math.floor(yy + s)); y1++)
      for (let x1 = x0; x1 <= Math.min(27, Math.floor(xx + s)); x1++) {
        const area =
          Math.max(0, Math.min(x1 + 1, xx + s) - Math.max(x1, xx)) *
          Math.max(0, Math.min(y1 + 1, yy + s) - Math.max(y1, yy));
        out[y1 * 28 + x1] = Math.min(1, out[y1 * 28 + x1] + area);
      }
  }
  return out;
}
export function markedChoice(
  im: Raster,
  choices: { value: string; rect: Rect }[],
  scale = 2,
): string {
  const selected = choices.filter(({ rect }) => {
    const [x, y, w, h] = rect.map((v) => v * scale),
      padding = scale * 1.3;
    let ink = 0,
      total = 0;
    for (let yy = Math.ceil(y + padding); yy < y + h - padding; yy++)
      for (let xx = Math.ceil(x + padding); xx < x + w - padding; xx++) {
        total++;
        if (dark(im, xx, yy)) ink++;
      }
    return total > 0 && ink / total > 0.13;
  });
  return selected.length === 1 ? selected[0].value : "";
}
