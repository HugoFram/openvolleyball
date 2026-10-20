/** Replay private reviewed crops through the same native reader as the app.
 * Usage: npx tsx scripts/evaluate-registration-native.ts EXPORT PACK NAME [--cpu] [--limit=3]
 * Output stays in ignored tmp. Known paper/label disagreements can be omitted
 * from metrics with --exclude=file.png (never used as recognition hints).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { RegistrationReader } from "../electron/registration-reader";
import {
  nativeTextCrop,
  textCrop,
  textSuggestion,
} from "../src/scan/handwriting";
const [directory, pack, name, ...options] = process.argv.slice(2);
if (!directory || !pack || !/^[a-z0-9-]+$/.test(name || ""))
  throw Error("Supply export, reader pack and experiment name");
const exclude = new Set(
  options.filter((s) => s.startsWith("--exclude=")).map((s) => s.slice(10)),
);
const limit = Number(
  options.find((s) => s.startsWith("--limit="))?.slice(8) || Infinity,
);
const input = await fs.readFile(path.join(directory, "inscriptions.json"));
const data = JSON.parse(input.toString("utf8"));
const root = path.resolve("tmp/registration-native-benchmarks");
await fs.mkdir(root, { recursive: true });
const reader = new RegistrationReader();
const predictions: any[] = [];
const hash = (s: Buffer) => createHash("sha256").update(s).digest("hex");
const started = performance.now();
try {
  await reader.start(path.resolve(pack), options.includes("--cpu"));
  const loaded = performance.now();
  for (const row of data.samples.slice(0, limit)) {
    const file = path.resolve(directory, row.file);
    if (!file.startsWith(path.resolve(directory) + path.sep))
      throw Error("Invalid image path");
    const raw = await fs.readFile(file);
    if (hash(raw) !== row.imageSha256) throw Error("Input checksum mismatch");
    const { data: pixels, info } = await sharp(raw)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const canvas = new Uint8ClampedArray(1191 * 842 * 4);
    canvas.fill(255);
    for (let y = 0; y < info.height; y++)
      canvas.set(
        pixels.subarray(y * info.width * 4, (y + 1) * info.width * 4),
        y * 1191 * 4,
      );
    const image = { width: 1191, height: 842, data: canvas },
      rect: [number, number, number, number] = [
        0,
        0,
        info.width / 2,
        info.height / 2,
      ];
    let prediction = "";
    if (textCrop(image, rect)) {
      const crop = nativeTextCrop(image, rect);
      const png = await sharp(Buffer.from(crop.data), {
        raw: { width: crop.width, height: crop.height, channels: 4 },
      })
        .png()
        .toBuffer();
      prediction = textSuggestion(
        await reader.read(
          "data:image/png;base64," + png.toString("base64"),
          row.kind === "email" ? "email" : "text",
        ),
        row.field,
      ).value;
    }
    predictions.push({ ...row, prediction, excluded: exclude.has(row.file) });
    if (predictions.length % 13 === 0)
      console.log(name, predictions.length, "fields");
  }
  const nonempty = Object.fromEntries(
    ["team", "name", "email", "club", "all"].map((kind) => {
      const rows = predictions.filter(
        (r) => r.text && !r.excluded && (kind === "all" || kind === r.kind),
      );
      return [
        kind,
        {
          correct: rows.filter(
            (r) => r.text.normalize("NFC").trim() === r.prediction,
          ).length,
          total: rows.length,
        },
      ];
    }),
  );
  const blank = predictions.filter((r) => !r.text);
  const summary = {
    name,
    runtime: "application native RegistrationReader",
    cpu: options.includes("--cpu"),
    trainingOnProvidedSamples: false,
    exportSha256: hash(input),
    packManifestSha256: hash(
      await fs.readFile(path.join(pack, "reader-pack.json")),
    ),
    nonempty,
    blank: {
      correct: blank.filter((r) => !r.prediction).length,
      total: blank.length,
    },
    startupSeconds: (loaded - started) / 1000,
    recognitionSeconds: (performance.now() - loaded) / 1000,
  };
  await fs.writeFile(
    path.join(root, name + "-private-predictions.json"),
    JSON.stringify(predictions, null, 2),
  );
  await fs.writeFile(
    path.join(root, name + "-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
} finally {
  reader.stop();
}
