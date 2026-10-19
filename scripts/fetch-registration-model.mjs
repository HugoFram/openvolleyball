/** Maintainer/source setup only. Distributed applications never download models. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  await fs.readFile("assets/models/registration-manifest.json", "utf8"),
);
for (const entry of manifest.files) {
  const target = path.join("assets/models", manifest.directory, entry.file);
  const valid = async () => {
    try {
      return (
        createHash("sha256")
          .update(await fs.readFile(target))
          .digest("hex") === entry.sha256
      );
    } catch {
      return false;
    }
  };
  if (await valid()) continue;
  const url = `https://huggingface.co/${manifest.repository}/resolve/${manifest.revision}/${entry.file}`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Model download failed: ${entry.file} (${response.status})`,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length !== entry.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256
  )
    throw new Error(`Model integrity check failed: ${entry.file}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  console.log(`Prepared ${entry.file}`);
}
console.log("Offline registration model ready.");
