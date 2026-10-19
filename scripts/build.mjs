import { build } from "esbuild";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const modelManifest = JSON.parse(
  await fs.readFile("assets/models/manifest.json", "utf8"),
);
const modelBytes = await fs.readFile(`assets/models/${modelManifest.file}`);
if (
  createHash("sha256").update(modelBytes).digest("hex") !== modelManifest.sha256
)
  throw new Error("The bundled handwriting model failed its integrity check.");
await fs.mkdir("dist-electron", { recursive: true });
await build({
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron", "pdfkit"],
  sourcemap: true,
});
await build({
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["electron/print-preload.ts"],
  outfile: "dist-electron/print-preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await fs.mkdir("dist/assets", { recursive: true });
await fs.copyFile("assets/volleyball.png", "dist/assets/volleyball.png");
await fs.mkdir("assets/licenses", { recursive: true });
await fs.copyFile(
  "node_modules/pdfjs-dist/LICENSE",
  "assets/licenses/PDFjs.txt",
);
await fs.mkdir("dist/assets/ort", { recursive: true });
await fs.mkdir("dist/assets/models", { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
])
  await fs.copyFile(
    `node_modules/onnxruntime-web/dist/${file}`,
    `dist/assets/ort/${file}`,
  );
await fs.copyFile(
  `assets/models/${modelManifest.file}`,
  `dist/assets/models/${modelManifest.file}`,
);
const registration = JSON.parse(
  await fs.readFile("assets/models/registration-manifest.json", "utf8"),
);
for (const entry of registration.files) {
  const source = `assets/models/${registration.directory}/${entry.file}`;
  const bytes = await fs.readFile(source).catch(() => {
    throw new Error(
      "Run npm run models:fetch to prepare the bundled registration model.",
    );
  });
  if (
    bytes.length !== entry.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256
  )
    throw new Error(`Registration model integrity check failed: ${entry.file}`);
  const target = `dist/assets/models/${registration.directory}/${entry.file}`;
  await fs.mkdir(target.substring(0, target.lastIndexOf("/")), {
    recursive: true,
  });
  await fs.writeFile(target, bytes);
}
await fs.copyFile(
  "node_modules/@huggingface/transformers/LICENSE",
  "assets/licenses/Transformers.js.txt",
);
for (const [pkg, name, file] of [
  ["qrcode", "qrcode", "license"],
  ["jsqr", "jsQR", "LICENSE"],
  ["@huggingface/tokenizers", "Tokenizers.js", "LICENSE"],
  ["@huggingface/jinja", "Jinja", "LICENSE"],
])
  await fs.copyFile(
    `node_modules/${pkg}/${file}`,
    `assets/licenses/${name}.txt`,
  );
