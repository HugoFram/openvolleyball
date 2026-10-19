/** Evaluate full handwritten scores from an explicitly reviewed local export. */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { InferenceSession, Tensor, env } from "onnxruntime-web/wasm";
import { digitTensor, type Raster } from "../src/scan/geometry";
import { readScore } from "../src/scan/digits";
import type { Rect } from "../src/domain/scans";
const folder = path.resolve(process.argv[2] || "");
if (!process.argv[2])
  throw new Error(
    "Usage: npx tsx scripts/evaluate-reviewed.ts <scores-relus-folder>",
  );
const data = JSON.parse(
  await fs.readFile(path.join(folder, "scores.json"), "utf8"),
);
if (
  data.format !== "open-volleyball-reviewed-scores" ||
  data.version !== 1 ||
  !Array.isArray(data.samples)
)
  throw new Error("Format d’export inconnu.");
env.wasm.numThreads = 1;
const runtime = await InferenceSession.create(
  new Uint8Array(await fs.readFile("assets/models/mnist-12.onnx")),
  { executionProviders: ["wasm"] },
);
const predict = async (input: Float32Array) =>
  Array.from(
    (
      await runtime.run({
        [runtime.inputNames[0]]: new Tensor("float32", input, [1, 1, 28, 28]),
      })
    )[runtime.outputNames[0]].data as Float32Array,
  );
const canonical = (text: string) =>
  /^\d{1,3}$/.test(text) ? String(Number(text)) : null;
const stats = {
  samples: 0,
  baselineCorrect: 0,
  baselineWrongNumeric: 0,
  currentCorrect: 0,
  currentWrongNumeric: 0,
  currentUnresolved: 0,
  currentTopCandidateCorrect: 0,
};
const differences: unknown[] = [];
for (const sample of data.samples) {
  if (
    !/^score-\d+\.png$/.test(sample.file) ||
    !canonical(sample.score) ||
    !Array.isArray(sample.boxes) ||
    sample.boxes.length !== 3
  )
    throw new Error("Extrait ou étiquette invalide.");
  const decoded = await sharp(path.join(folder, sample.file))
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const im: Raster = {
    width: decoded.info.width,
    height: decoded.info.height,
    data: new Uint8ClampedArray(decoded.data),
  };
  const rects: Rect[] = sample.boxes.map((r: number[]) => {
    if (
      r.length !== 4 ||
      r.some((v) => !Number.isFinite(v)) ||
      r[2] <= 0 ||
      r[3] <= 0
    )
      throw new Error("Coordonnées invalides.");
    return r.map((v) => v / 2) as Rect;
  });
  let previous = "",
    seen = false,
    gap = false;
  for (const rect of rects) {
    const tensor = digitTensor(im, rect);
    if (!tensor) {
      if (seen) gap = true;
      continue;
    }
    if (gap) {
      previous += "?";
      continue;
    }
    seen = true;
    const logits = await predict(tensor);
    previous += String(logits.indexOf(Math.max(...logits)));
  }
  const current = await readScore(im, rects, predict),
    truth = canonical(sample.score);
  stats.samples++;
  if (canonical(previous) === truth) stats.baselineCorrect++;
  else if (canonical(previous) !== null) stats.baselineWrongNumeric++;
  if (canonical(current.value) === truth) stats.currentCorrect++;
  else if (canonical(current.value) !== null) stats.currentWrongNumeric++;
  else stats.currentUnresolved++;
  if (
    canonical(
      current.value === "?" ? current.alternatives?.[0] || "" : current.value,
    ) === truth
  )
    stats.currentTopCandidateCorrect++;
  if (canonical(current.value) !== truth)
    differences.push({
      file: sample.file,
      expected: sample.score,
      baseline: previous,
      current,
    });
}
console.log(
  JSON.stringify(
    {
      note: "Reviewed labels need checking. These are whole-score counts; not per-digit accuracy. Do not reuse tuning writers as an independent validation set.",
      ...stats,
      ...(process.argv.includes("--details") ? { differences } : {}),
    },
    null,
    2,
  ),
);
