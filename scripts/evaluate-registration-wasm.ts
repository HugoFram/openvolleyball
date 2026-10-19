/** Local-only replay of reviewed crops through the actual shipped JS/WASM reader.
 * Detailed results stay in ignored tmp; the report contains aggregates only.
 * Run with: npx tsx scripts/evaluate-registration-wasm.ts EXPORT_DIRECTORY NAME
 * Build first. Neither the tournament nor the supplied export is modified.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { _electron as electron } from "@playwright/test";
import sharp from "sharp";
import { textCrop, textSuggestion } from "../src/scan/handwriting";

const [directory, name] = process.argv.slice(2);
if (!directory || !/^[a-z0-9-]+$/.test(name || ""))
  throw Error(
    "Supply a reviewed registration export and a simple experiment name",
  );
const root = path.resolve("tmp/registration-alpha6");
await fs.mkdir(root, { recursive: true });
const bytes = await fs.readFile(path.join(directory, "inscriptions.json"));
const preprocessingSha256 = createHash("sha256")
  .update(await fs.readFile("src/scan/handwriting.ts"))
  .digest("hex");
const data = JSON.parse(bytes.toString("utf8"));
const readerConfig = JSON.parse(
  await fs.readFile("dist/assets/models/registration/reader.json", "utf8"),
);
const weights = Object.fromEntries(
  await Promise.all(
    ["encoder_model_quantized.onnx", "decoder_model_merged_quantized.onnx"].map(
      async (file) => [
        file,
        createHash("sha256")
          .update(
            await fs.readFile(
              `dist/assets/models/registration/trocr-small-handwritten/onnx/${file}`,
            ),
          )
          .digest("hex"),
      ],
    ),
  ),
);
const reader = (await fs.readdir("dist/assets")).find((f) =>
  /^text-reader-.*\.js$/.test(f),
);
if (!reader) throw Error("Build the application first");
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (e): e is [string, string] => e[1] !== undefined,
  ),
);
delete env.ELECTRON_RUN_AS_NODE;
const profile = await fs.mkdtemp(
  path.join(os.tmpdir(), "OV-reader-evaluation-"),
);
const app = await electron.launch({
  args: [".", `--user-data-dir=${profile}`],
  env,
});
const predictions: any[] = [];
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.context().setOffline(true);
  const external: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) external.push(r.url());
  });
  for (const row of data.samples) {
    const raw = await fs.readFile(path.join(directory, row.file));
    if (createHash("sha256").update(raw).digest("hex") !== row.imageSha256)
      throw Error("Input hash mismatch: " + row.file);
    const { data: rgba, info } = await sharp(raw)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const canvas = new Uint8ClampedArray(1191 * 842 * 4);
    canvas.fill(255);
    for (let y = 0; y < info.height; y++)
      canvas.set(
        rgba.subarray(y * info.width * 4, (y + 1) * info.width * 4),
        y * 1191 * 4,
      );
    const crop = textCrop({ width: 1191, height: 842, data: canvas }, [
      0,
      0,
      info.width / 2,
      info.height / 2,
    ]);
    const text = crop
      ? await page.evaluate(
          async ({ crop, url, max, kind }) => {
            const { transcribe } = await import(/* @vite-ignore */ url);
            return transcribe(crop, max, kind);
          },
          {
            crop: { ...crop, data: Array.from(crop.data) },
            url: `/assets/${reader}`,
            max: row.kind === "email" ? 80 : 48,
            kind: row.kind === "email" ? "email" : "text",
          },
        )
      : "";
    predictions.push({
      ...row,
      prediction: textSuggestion(text, row.field).value,
    });
    if (predictions.length % 13 === 0)
      console.log(name, predictions.length, data.samples.length);
  }
  if (external.length) throw Error("Unexpected external request");
  await fs.writeFile(
    path.join(root, `${name}-wasm-private-predictions.json`),
    JSON.stringify(predictions, null, 2),
  );
} finally {
  await app.close();
  if (
    !path
      .resolve(profile)
      .startsWith(
        path.resolve(os.tmpdir()) + path.sep + "OV-reader-evaluation-",
      )
  )
    throw Error("Refusing cleanup outside the evaluation profile directory");
  await fs.rm(profile, { recursive: true, force: true });
}
// Keep the detailed strings out of source control and published logs.
const kinds = ["team", "name", "email", "club", "blank"];
const summary = Object.fromEntries(
  kinds.map((kind) => {
    const rows = predictions.filter((r) =>
      kind === "blank" ? !r.text : r.text && r.kind === kind,
    );
    return [
      kind,
      {
        samples: rows.length,
        exact: rows.filter((r) => r.text === r.prediction).length,
        caseInsensitiveExact: rows.filter(
          (r) =>
            r.text.toLocaleLowerCase() === r.prediction.toLocaleLowerCase(),
        ).length,
      },
    ];
  }),
);
const report = {
  format: "open-volleyball-reviewed-registration-wasm",
  version: 1,
  name,
  runtime:
    "Electron Transformers.js 4.3.1 / ONNX Runtime Web 1.30.0 CPU WASM, offline",
  exportSha256: createHash("sha256").update(bytes).digest("hex"),
  preparation:
    "Current application textCrop/textSuggestion on exported field crops; one edge pixel may differ from the original page crop",
  privateSamplesUsedForTraining: readerConfig.privateTrainingFields,
  taskPrefixes: readerConfig.taskPrefixes,
  preprocessingSha256,
  weights,
  externalRequests: 0,
  summary,
};
await fs.writeFile(
  path.join(root, `${name}-wasm-summary.json`),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(summary));
