import { build } from "esbuild";
import fs from "node:fs/promises";
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
