/** Local-only training inputs. Audit approved labels against the paper first. */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prepareDigit } from "../src/scan/digits";
import type { Rect } from "../src/domain/scans";
const [folder, exclusionsFile, output] = process.argv.slice(2);
if (!folder || !exclusionsFile || !output)
  throw new Error(
    "Usage: prepare-reviewed-digits <folder> <exclusions.json> <local-output.json>",
  );
const data = JSON.parse(
  await fs.readFile(path.join(folder, "scores.json"), "utf8"),
);
if (data.format !== "open-volleyball-reviewed-scores" || data.version !== 1)
  throw new Error("Invalid reviewed export");
const exclusions = JSON.parse(await fs.readFile(exclusionsFile, "utf8"));
const digits: unknown[] = [],
  skipped: string[] = [];
for (const sample of data.samples) {
  if (Object.hasOwn(exclusions, sample.file)) continue;
  if (
    !/^score-\d+\.png$/.test(sample.file) ||
    !/^\d{1,3}$/.test(sample.score) ||
    !/^[a-f0-9]{64}$/.test(sample.captureGroup)
  )
    throw new Error("Invalid sample or missing page grouping");
  const image = await sharp(path.join(folder, sample.file))
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raster = {
    width: image.info.width,
    height: image.info.height,
    data: new Uint8ClampedArray(image.data),
  };
  const prepared = sample.boxes
    .map((r: number[]) => prepareDigit(raster, r.map((v) => v / 2) as Rect))
    .filter(Boolean);
  // No training label may be invented for a blank, overwritten, or extra digit.
  if (
    prepared.length !== sample.score.length ||
    prepared.some((p: any) => p.issue)
  ) {
    skipped.push(sample.file);
    continue;
  }
  prepared.forEach((p: any, i: number) =>
    p.variants.forEach((tensor: Float32Array) =>
      digits.push({
        file: sample.file,
        group: sample.captureGroup,
        label: Number(sample.score[i]),
        pixels: Array.from(tensor),
      }),
    ),
  );
}
await fs.writeFile(
  output,
  JSON.stringify({
    format: "open-volleyball-reviewed-digits",
    version: 1,
    digits,
    skipped,
  }),
);
console.log(JSON.stringify({ prepared: digits.length, skipped }));
