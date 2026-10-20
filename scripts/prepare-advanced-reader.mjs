// Explicit maintainer/setup operation. The application itself never downloads models.
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
const recipe = JSON.parse(
  await fs.readFile("assets/models/advanced-reader-recipe.json", "utf8"),
);
const output = path.resolve("release/OpenVolleyball-LecteurAvance");
const cache = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const hash = async (file) => {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
};
async function obtain(entry, target, cached) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (
    await fs.access(target).then(
      () => true,
      () => false,
    )
  ) {
    if ((await hash(target)) !== entry.sha256)
      throw Error("Existing file has the wrong checksum: " + target);
    return;
  }
  if (
    cached &&
    (await fs.access(cached).then(
      () => true,
      () => false,
    ))
  ) {
    if ((await hash(cached)) !== entry.sha256)
      throw Error("Cache checksum mismatch: " + cached);
    await fs.link(cached, target).catch(() => fs.copyFile(cached, target));
  } else {
    console.log("Preparing", path.basename(target));
    const response = await fetch(entry.url);
    if (!response.ok || !response.body)
      throw Error("Download failed: " + response.status);
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(target + ".part"),
    );
    if ((await hash(target + ".part")) !== entry.sha256)
      throw Error("Download checksum mismatch");
    await fs.rename(target + ".part", target);
  }
  if (entry.bytes && (await fs.stat(target)).size !== entry.bytes)
    throw Error("Truncated file");
}
for (const entry of recipe.files) {
  const cached =
    cache &&
    path.join(
      cache,
      entry.file.startsWith("models/") ? "qwen35" : "licenses",
      path.basename(entry.file),
    );
  await obtain(entry, path.join(output, entry.file), cached);
}
const archive = path.resolve("tmp/advanced-reader-runtime.zip");
await fs.mkdir("tmp", { recursive: true });
await obtain(
  recipe.runtime,
  archive,
  cache && path.join(cache, "llama-vulkan.zip"),
);
const runtime = path.resolve("tmp/advanced-reader-runtime");
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Expand-Archive -LiteralPath $env:OV_READER_ARCHIVE -DestinationPath $env:OV_READER_RUNTIME -Force",
  ],
  {
    windowsHide: true,
    env: {
      ...process.env,
      OV_READER_ARCHIVE: archive,
      OV_READER_RUNTIME: runtime,
    },
    stdio: "ignore",
  },
);
await fs.mkdir(path.join(output, "runtime"), { recursive: true });
for (const name of await fs.readdir(runtime))
  if (
    name.endsWith(".dll") ||
    name === "llama-server.exe" ||
    name.startsWith("LICENSE")
  )
    await fs.copyFile(
      path.join(runtime, name),
      path.join(output, "runtime", name),
    );
await fs.writeFile(
  path.join(output, "LISEZ-MOI.txt"),
  `Lecteur avancé expérimental — Open Volleyball\n\nDécompressez entièrement ce dossier et conservez-le sur ce PC. Dans Feuilles scannées, cliquez sur Installer le lecteur avancé et sélectionnez ce dossier. Aucun compte ni accès Internet n'est nécessaire à l'utilisation.\n\nModèle public Qwen3.5 9B Q4_K_M, sans entraînement sur les inscriptions fournies. Runtime llama.cpp b11669. Les images restent sur le PC ; le service privé écoute uniquement sur 127.0.0.1 et est arrêté après analyse.\n\nPrévoir environ 7 Go de disque ; 16 Go de RAM au minimum, 32 Go conseillés. GPU compatible Vulkan facultatif, 12 Go de VRAM conseillés pour cette configuration. Cocher Utiliser seulement le processeur si nécessaire ; la lecture sera plus lente.\n\nLa précision n'atteint pas encore le seuil de 75 % demandé. Vérifiez chaque champ. Les écritures cursives sont acceptées ; aucune obligation de lettres capitales ou de cases par caractère. Ne supprimez pas ce dossier après installation.\n\nSources et licences : reader-pack.json, licenses, runtime/LICENSE-LLVM-OpenMP. Qwen : Apache 2.0 ; llama.cpp : MIT. Aucun scan, nom, e-mail ni modèle personnalisé n'est inclus.\n`,
);
const files = [];
async function inventory(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else if (entry.name !== "reader-pack.json")
      files.push({
        file: path.relative(output, file).replaceAll("\\", "/"),
        bytes: (await fs.stat(file)).size,
        sha256: await hash(file),
      });
  }
}
await inventory(output);
await fs.writeFile(
  path.join(output, "reader-pack.json"),
  JSON.stringify(
    {
      format: "open-volleyball-local-reader",
      version: 1,
      name: recipe.name,
      reader: recipe.reader,
      executable: recipe.executable,
      model: recipe.model,
      projector: recipe.projector,
      imageMinTokens: recipe.imageMinTokens,
      source: recipe.source,
      runtime: recipe.runtime,
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log("Local reader pack prepared:", output);
