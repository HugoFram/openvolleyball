import { build } from "esbuild";
import fs from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";
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
const png = await sharp("assets/volleyball.svg").png().toBuffer();
await fs.writeFile("assets/volleyball.png", png);
await fs.writeFile("assets/volleyball.ico", await pngToIco(png));
await fs.mkdir("dist/assets", { recursive: true });
await fs.copyFile("assets/volleyball.svg", "dist/assets/volleyball.svg");
