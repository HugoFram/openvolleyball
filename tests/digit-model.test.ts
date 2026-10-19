import { it, expect } from "vitest";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { InferenceSession, Tensor, env } from "onnxruntime-web/wasm";
import { readScore } from "../src/scan/digits";

it("the shipped offline model preserves hooked ones, crossed sevens and looped nines", async () => {
  const manifest = JSON.parse(
    await fs.readFile("assets/models/manifest.json", "utf8"),
  );
  const bytes = await fs.readFile(`assets/models/${manifest.file}`);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    manifest.sha256,
  );
  env.wasm.numThreads = 1;
  const runtime = await InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ["wasm"],
  });
  try {
    const predict = async (pixels: Float32Array) =>
      Array.from(
        (
          await runtime.run({
            [runtime.inputNames[0]]: new Tensor(
              "float32",
              pixels,
              [1, 1, 28, 28],
            ),
          })
        )[runtime.outputNames[0]].data as Float32Array,
      );
    // Independently drawn strokes; no private tournament crop is in this fixture.
    const paths = {
      "1": "M14 15 L26 8 L26 42",
      "7": "M12 9 L36 9 L19 42 M15 25 L31 25",
      "9": "M31 19 Q17 29 16 17 Q15 7 25 8 Q38 8 31 28 Q29 44 16 41",
    };
    for (const [label, d] of Object.entries(paths)) {
      const raw = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="58"><rect width="54" height="58" fill="white"/><path d="${d}" fill="none" stroke="#151515" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        ),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const read = await readScore(
        {
          width: raw.info.width,
          height: raw.info.height,
          data: new Uint8ClampedArray(raw.data),
        },
        [[0, 0, 25, 25]],
        predict,
      );
      expect(read.reader).toBe("style-cnn-v3");
      expect(read.value === "?" ? read.alternatives : [read.value]).toContain(
        label,
      );
    }
  } finally {
    await runtime.release();
  }
}, 20000);
