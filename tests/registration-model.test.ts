import { it, expect } from "vitest";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";

it("source chunks reconstruct exactly the selected aligned-objective offline registration model", async () => {
  const manifest = JSON.parse(
    await fs.readFile("assets/models/registration-manifest.json", "utf8"),
  );
  expect(manifest.adaptation.reader).toBe("trocr-fr-v2");
  expect(manifest.adaptation.objective).toBe("aligned-cross-entropy-v1");
  expect(manifest.adaptation.checkpointSha256).toMatch(/^[a-f0-9]{64}$/);
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  for (const entry of manifest.files) {
    const runtime = await fs.readFile(
      `assets/models/${manifest.directory}/${entry.file}`,
    );
    expect(runtime.length).toBe(entry.bytes);
    expect(hash(runtime)).toBe(entry.sha256);
    if (!entry.chunks) continue;
    const chunks: Buffer[] = [];
    for (const chunk of entry.chunks) {
      const bytes = await fs.readFile(`assets/models/${chunk.file}`);
      expect(bytes.length).toBe(chunk.bytes);
      expect(hash(bytes)).toBe(chunk.sha256);
      chunks.push(bytes);
    }
    expect(brotliDecompressSync(Buffer.concat(chunks)).equals(runtime)).toBe(true);
  }
});
