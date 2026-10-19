import type { PaperForm, Rect, ScanValue } from "../domain/scans";
import type { Raster } from "./geometry";
import { normalizedScale } from "./geometry";
export const textReaderVersion = "trocr-fr-v3";

/** Paper metadata uses page coordinates; a cut form's normalized image is local. */
export function localRect(form: PaperForm, rect: Rect): Rect {
  return [
    rect[0] - (form.region?.[0] || 0),
    rect[1] - (form.region?.[1] || 0),
    rect[2],
    rect[3],
  ];
}

/** Isolate handwriting before invoking a language model. Empty cells stay empty,
 * including ruled team-name guides; printed borders must never become invented text. */
export function textCrop(im: Raster, rect: Rect): Raster | null {
  const scale = normalizedScale(im.width, im.height);
  const left = Math.max(0, Math.ceil(rect[0] * scale)),
    top = Math.max(0, Math.ceil(rect[1] * scale));
  const width = Math.max(
      0,
      Math.min(im.width, Math.floor((rect[0] + rect[2]) * scale)) - left,
    ),
    height = Math.max(
      0,
      Math.min(im.height, Math.floor((rect[1] + rect[3]) * scale)) - top,
    );
  if (width < 3 || height < 4) return null;
  const gray = new Uint8Array(width * height),
    hist = new Uint32Array(256);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const k = ((top + y) * im.width + left + x) * 4;
      const g =
        im.data[k + 3] < 128
          ? 255
          : Math.round(
              im.data[k] * 0.299 +
                im.data[k + 1] * 0.587 +
                im.data[k + 2] * 0.114,
            );
      gray[y * width + x] = g;
      hist[g]++;
    }
  const percentile = (p: number) => {
    let n = 0;
    for (let i = 0; i < 256; i++) {
      n += hist[i];
      if (n >= gray.length * p) return i;
    }
    return 255;
  };
  const paper = percentile(0.9),
    ink = percentile(0.015),
    threshold = paper - Math.max(28, (paper - ink) * 0.4);
  // Pale printed ruling may lie inside a crop (old blank registration templates).
  for (let y = 0; y < height; y++) {
    let dark = 0;
    for (let x = 0; x < width; x++) if (gray[y * width + x] < threshold) dark++;
    if (dark > width * 0.8)
      for (let x = 0; x < width; x++)
        // Dark cell borders at the crop edge are also print, not handwriting.
        if (y < 3 || y >= height - 3 || gray[y * width + x] > 95)
          gray[y * width + x] = paper;
  }
  const seen = new Uint8Array(gray.length),
    kept: number[] = [];
  let largest = 0;
  for (let seed = 0; seed < gray.length; seed++) {
    if (seen[seed] || gray[seed] >= threshold) continue;
    const component = [seed];
    seen[seed] = 1;
    for (let i = 0; i < component.length; i++) {
      const k = component[i],
        x = k % width,
        y = Math.floor(k / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy,
            n = yy * width + xx;
          if (
            xx < 0 ||
            yy < 0 ||
            xx >= width ||
            yy >= height ||
            seen[n] ||
            gray[n] >= threshold
          )
            continue;
          seen[n] = 1;
          component.push(n);
        }
    }
    largest = Math.max(largest, component.length);
    if (component.length >= 3) kept.push(...component);
  }
  // Scattered remnants of text showing through paper are not a pen stroke.
  if (kept.length < 14 || largest < 12) return null;
  let x0 = width,
    y0 = height,
    x1 = 0,
    y1 = 0;
  for (const k of kept) {
    x0 = Math.min(x0, k % width);
    x1 = Math.max(x1, k % width);
    y0 = Math.min(y0, Math.floor(k / width));
    y1 = Math.max(y1, Math.floor(k / width));
  }
  if (x1 - x0 < 2 || y1 - y0 < 5) return null;
  const pad = Math.max(6, Math.round((y1 - y0 + 1) * 0.12)),
    w = x1 - x0 + 1 + pad * 2,
    h = y1 - y0 + 1 + pad * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  data.fill(255);
  for (const k of kept) {
    const dst =
      ((Math.floor(k / width) - y0 + pad) * w + (k % width) - x0 + pad) * 4;
    const g = Math.max(
      0,
      255 - ((paper - gray[k]) * 255) / Math.max(35, paper - ink),
    );
    data[dst] = data[dst + 1] = data[dst + 2] = g;
  }
  return { width: w, height: h, data };
}

export function textSuggestion(text: string, key: string): ScanValue {
  let value = text
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, 200);
  let issue: string | undefined = value
    ? undefined
    : "Écriture détectée, texte non reconnu";
  if (key.endsWith(":email") && value) {
    const joined = value.replace(/\s/g, "");
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(joined)) value = joined;
    else issue = "Format d’e-mail à vérifier";
  }
  return { value, reader: textReaderVersion, ...(issue ? { issue } : {}) };
}
