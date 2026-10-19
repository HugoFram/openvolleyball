import type { Rect, ScanValue } from "../domain/scans";
import type { Raster } from "./geometry";

export interface PreparedDigit {
  variants: Float32Array[];
  issue?: string;
}

/** Local paper/ink contrast, speck removal, and MNIST-scale normalization. */
export function prepareDigit(
  im: Raster,
  rect: Rect,
  scale = 2,
  extraBottom = 0,
): PreparedDigit | null {
  const [rx, ry, rw, rh] = rect.map((v) => v * scale),
    pad = Math.max(1, Math.round(scale * 0.85));
  const left = Math.max(0, Math.ceil(rx + pad)),
    top = Math.max(0, Math.ceil(ry + pad));
  const width = Math.max(
      0,
      Math.min(im.width, Math.floor(rx + rw - pad)) - left,
    ),
    height = Math.max(
      0,
      Math.min(im.height, Math.floor(ry + rh + extraBottom * scale - pad)) -
        top,
    );
  if (width < 3 || height < 3) return null;
  const gray = new Float32Array(width * height),
    hist = new Uint32Array(256);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = ((top + y) * im.width + left + x) * 4;
      const value =
        im.data[i + 3] < 128
          ? 255
          : Math.round(
              im.data[i] * 0.299 +
                im.data[i + 1] * 0.587 +
                im.data[i + 2] * 0.114,
            );
      gray[y * width + x] = value;
      hist[value]++;
    }
  const percentile = (fraction: number) => {
    let count = 0;
    for (let i = 0; i < 256; i++) {
      count += hist[i];
      if (count >= gray.length * fraction) return i;
    }
    return 255;
  };
  const paper = percentile(0.9),
    ink = percentile(0.015),
    contrast = paper - ink;
  const threshold = paper - Math.max(22, contrast * 0.35),
    seen = new Uint8Array(gray.length);
  if (extraBottom) {
    // Recover pen below the guide while removing its pale printed crossbar.
    for (let y = 0; y < height; y++)
      if (Math.abs(top + y - (ry + rh)) <= scale * 0.7)
        for (let x = 0; x < width; x++)
          if (gray[y * width + x] > Math.min(165, paper - 35))
            gray[y * width + x] = paper;
  }
  const components: {
    indices: number[];
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }[] = [];
  for (let seed = 0; seed < gray.length; seed++) {
    if (seen[seed] || gray[seed] >= threshold) continue;
    const indices = [seed];
    seen[seed] = 1;
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    for (let n = 0; n < indices.length; n++) {
      const k = indices[n],
        x = k % width,
        y = Math.floor(k / width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            nk = ny * width + nx;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= width ||
            ny >= height ||
            seen[nk] ||
            gray[nk] >= threshold
          )
            continue;
          seen[nk] = 1;
          indices.push(nk);
        }
    }
    // Reject disconnected remnants of the printed boundary, not pen strokes
    // joined to a digit. The crop already excludes most of the guide line.
    const boundaryLine =
      ((x0 === 0 || x1 === width - 1) &&
        x1 - x0 <= 1 &&
        y1 - y0 > height * 0.8) ||
      ((y0 === 0 || y1 === height - 1) &&
        y1 - y0 <= 1 &&
        x1 - x0 > width * 0.8);
    if (!boundaryLine) components.push({ indices, x0, y0, x1, y1 });
  }
  components.sort((a, b) => b.indices.length - a.indices.length);
  const biggest = components[0];
  if (!biggest || biggest.indices.length < 5 || biggest.y1 - biggest.y0 < 3)
    return null;
  if (!extraBottom && biggest.y1 >= height - 2) {
    const extended = prepareDigit(im, rect, scale, 3);
    if (extended) return extended;
  }
  const keep = components.filter(
    (c) => c.indices.length >= Math.max(3, biggest.indices.length * 0.045),
  );
  const x0 = Math.min(...keep.map((c) => c.x0)),
    y0 = Math.min(...keep.map((c) => c.y0)),
    x1 = Math.max(...keep.map((c) => c.x1)),
    y1 = Math.max(...keep.map((c) => c.y1));
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    resize = 20 / Math.max(w, h),
    base = new Float32Array(784),
    ox = (28 - w * resize) / 2,
    oy = (28 - h * resize) / 2;
  for (const component of keep)
    for (const k of component.indices) {
      const x = k % width,
        y = Math.floor(k / width),
        xx = ox + (x - x0) * resize,
        yy = oy + (y - y0) * resize;
      const weight = Math.min(1, (paper - gray[k]) / Math.max(25, contrast));
      for (
        let ty = Math.max(0, Math.floor(yy));
        ty <= Math.min(27, Math.floor(yy + resize));
        ty++
      )
        for (
          let tx = Math.max(0, Math.floor(xx));
          tx <= Math.min(27, Math.floor(xx + resize));
          tx++
        ) {
          const area =
            Math.max(0, Math.min(tx + 1, xx + resize) - Math.max(tx, xx)) *
            Math.max(0, Math.min(ty + 1, yy + resize) - Math.max(ty, yy));
          base[ty * 28 + tx] = Math.min(1, base[ty * 28 + tx] + area * weight);
        }
    }
  const centered = centerMass(base),
    variants = [centered, base];
  let mass = 0,
    cx = 0,
    cy = 0;
  centered.forEach((v, k) => {
    mass += v;
    cx += v * (k % 28);
    cy += v * Math.floor(k / 28);
  });
  cx /= mass;
  cy /= mass;
  let mu11 = 0,
    mu02 = 0;
  centered.forEach((v, k) => {
    mu11 += v * ((k % 28) - cx) * (Math.floor(k / 28) - cy);
    mu02 += v * (Math.floor(k / 28) - cy) ** 2;
  });
  const skew = Math.max(-0.6, Math.min(0.6, mu11 / Math.max(1e-6, mu02)));
  if (Math.abs(skew) > 0.08) {
    const deskewed = new Float32Array(784);
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 28; x++)
        deskewed[y * 28 + x] = sample(centered, x + skew * (y - cy), y);
    variants.push(centerMass(deskewed));
  } else {
    const thickened = new Float32Array(centered);
    for (let y = 1; y < 27; y++)
      for (let x = 1; x < 27; x++) {
        let peak = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            peak = Math.max(peak, centered[(y + dy) * 28 + x + dx]);
        thickened[y * 28 + x] = centered[y * 28 + x] * 0.65 + peak * 0.35;
      }
    variants.push(centerMass(thickened));
  }
  const issue =
    h < 8
      ? "Chiffre trop petit ou incomplet"
      : keep.length > 3
        ? "Traits multiples ou rature dans la case"
        : undefined;
  return { variants, issue };
}
function sample(im: Float32Array, x: number, y: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const at = (xx: number, yy: number) =>
    xx < 0 || xx > 27 || yy < 0 || yy > 27 ? 0 : im[yy * 28 + xx];
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x0 + 1, y0) * fx * (1 - fy) +
    at(x0, y0 + 1) * (1 - fx) * fy +
    at(x0 + 1, y0 + 1) * fx * fy
  );
}
function centerMass(im: Float32Array): Float32Array {
  let mass = 0,
    cx = 0,
    cy = 0;
  im.forEach((v, k) => {
    mass += v;
    cx += v * (k % 28);
    cy += v * Math.floor(k / 28);
  });
  if (!mass) return im;
  const dx = 13.5 - cx / mass,
    dy = 13.5 - cy / mass,
    out = new Float32Array(784);
  for (let y = 0; y < 28; y++)
    for (let x = 0; x < 28; x++) out[y * 28 + x] = sample(im, x - dx, y - dy);
  return out;
}
export type DigitPredictor = (tensor: Float32Array) => Promise<number[]>;
const probabilities = (logits: number[]) => {
  const max = Math.max(...logits),
    e = logits.map((v) => Math.exp(v - max)),
    sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
};

/** Independent preparations must agree; uncertainty is explicit, never fixed by score rules. */
export async function readScore(
  im: Raster,
  rects: Rect[],
  predict: DigitPredictor,
  scale = 2,
  reader: ScanValue["reader"] = "style-cnn-v3",
): Promise<ScanValue> {
  const positions: {
    options: { value: string; weight: number }[];
    confidence: number;
  }[] = [];
  let seen = false,
    gap = false,
    issue = "";
  for (const rect of rects) {
    const prepared = prepareDigit(im, rect, scale);
    if (!prepared) {
      if (seen) gap = true;
      continue;
    }
    if (gap) issue = "Case vide au milieu du score";
    seen = true;
    if (prepared.issue) issue = prepared.issue;
    const readings: number[][] = [];
    for (const tensor of prepared.variants)
      readings.push(probabilities(await predict(tensor)));
    const mean = Array.from(
      { length: 10 },
      (_, n) => readings.reduce((s, r) => s + r[n], 0) / readings.length,
    );
    const ranked = mean
      .map((weight, n) => ({ value: String(n), weight }))
      .sort((a, b) => b.weight - a.weight);
    const first = Number(ranked[0].value),
      confidentDisagreement = readings.some(
        (r) => r.indexOf(Math.max(...r)) !== first && Math.max(...r) > 0.75,
      );
    if (
      confidentDisagreement ||
      ranked[0].weight < 0.85 ||
      ranked[0].weight - ranked[1].weight < 0.55
    )
      issue ||= "Lectures différentes ou chiffre ambigu";
    positions.push({
      options: ranked.filter((r, i) => i === 0 || (i < 2 && r.weight > 0.025)),
      confidence: ranked[0].weight,
    });
  }
  if (!positions.length) return { value: "", reader };
  let candidates = [{ value: "", weight: 1 }];
  for (const position of positions)
    candidates = candidates
      .flatMap((c) =>
        position.options.map((o) => ({
          value: c.value + o.value,
          weight: c.weight * o.weight,
        })),
      )
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  return {
    reader,
    value: issue ? "?" : candidates[0].value,
    confidence: Math.min(...positions.map((p) => p.confidence)),
    ...(issue ? { issue, alternatives: candidates.map((c) => c.value) } : {}),
  };
}
