/** Controlled robustness benchmark; not an estimate of real tournament accuracy. */
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { InferenceSession, Tensor, env } from "onnxruntime-web/wasm";
import { digitTensor, type Raster } from "../src/scan/geometry";
import { readScore } from "../src/scan/digits";
env.wasm.numThreads = 1;
const images = gunzipSync(
  await fs.readFile(process.argv[2] || "tmp/mnist-images.gz"),
);
const labels = gunzipSync(
  await fs.readFile(process.argv[3] || "tmp/mnist-labels.gz"),
);
const count = Number(process.argv[4] || 1000),
  offset = 100;
const manifest = JSON.parse(
  await fs.readFile("assets/models/manifest.json", "utf8"),
);
const runtime = await InferenceSession.create(
  new Uint8Array(await fs.readFile(`assets/models/${manifest.file}`)),
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
const legacyRuntime = await InferenceSession.create(
  new Uint8Array(await fs.readFile("assets/models/mnist-12.onnx")),
  { executionProviders: ["wasm"] },
);
const legacyPredict = async (input: Float32Array) =>
  Array.from(
    (
      await legacyRuntime.run({
        [legacyRuntime.inputNames[0]]: new Tensor(
          "float32",
          input,
          [1, 1, 28, 28],
        ),
      })
    )[legacyRuntime.outputNames[0]].data as Float32Array,
  );
const results = [];
for (const mode of ["clean", "faint", "slanted", "compact"] as const) {
  let baselineCorrect = 0,
    baselineSuggested = 0,
    newCorrect = 0,
    newTopCorrect = 0,
    suggested = 0,
    wrongSuggested = 0,
    unresolved = 0;
  for (
    let i = offset;
    i < Math.min(labels.readUInt32BE(4), count + offset);
    i++
  ) {
    const expected = String(labels[8 + i]),
      src = images.subarray(16 + i * 784, 16 + (i + 1) * 784);
    const width = mode === "compact" ? 28 : 50,
      height = mode === "compact" ? 36 : 50,
      paper = mode === "faint" ? 235 : 255,
      ink = mode === "faint" ? 145 : 25,
      im: Raster = {
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      };
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const k = (y * width + x) * 4,
          scale = Math.min((width - 5) / 28, (height - 5) / 28),
          sy = Math.floor((y - height / 2) / scale + 14),
          sx = Math.floor(
            (x -
              width / 2 -
              (mode === "slanted" ? (y - height / 2) * 0.25 : 0)) /
              scale +
              14,
          );
        const amount =
            sx >= 0 && sx < 28 && sy >= 0 && sy < 28
              ? src[sy * 28 + sx] / 255
              : 0,
          v = Math.round(paper - (paper - ink) * amount);
        im.data[k] = im.data[k + 1] = im.data[k + 2] = v;
        im.data[k + 3] = 255;
      }
    const rect: [number, number, number, number] = [
        0,
        0,
        width / 2,
        height / 2,
      ],
      legacy = digitTensor(im, rect);
    if (legacy) {
      baselineSuggested++;
      const logits = await legacyPredict(legacy);
      if (String(logits.indexOf(Math.max(...logits))) === expected)
        baselineCorrect++;
    }
    const read = await readScore(im, [rect], predict);
    if ((read.value === "?" ? read.alternatives?.[0] : read.value) === expected)
      newTopCorrect++;
    if (read.value === expected) newCorrect++;
    if (read.value && read.value !== "?") {
      suggested++;
      if (read.value !== expected) wrongSuggested++;
    } else unresolved++;
  }
  results.push({
    mode,
    count,
    baselineCorrect,
    baselineSuggested,
    newCorrect,
    newTopCorrect,
    suggested,
    wrongSuggested,
    unresolved,
  });
}
console.log(
  JSON.stringify(
    {
      purpose:
        "Synthetic controlled comparison only; no inference about real scanner accuracy",
      offset,
      results,
    },
    null,
    2,
  ),
);
