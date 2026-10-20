import { it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  RegistrationReader,
  verifyReaderPack,
} from "../electron/registration-reader";
import { nativeTextCrop } from "../src/scan/handwriting";

it("preserves raw ink, trims exactly one pixel per edge and pads without adjacent cells", () => {
  const data = new Uint8ClampedArray(1191 * 842 * 4);
  data.fill(255);
  data.set([40, 60, 80, 255], (2 * 1191 + 2) * 4);
  data.set([0, 0, 0, 255], (2 * 1191 + 100) * 4);
  const crop = nativeTextCrop(
    { width: 1191, height: 842, data },
    [0, 0, 50, 25],
  );
  expect([crop.width, crop.height]).toEqual([130, 80]);
  expect(
    Array.from(crop.data.slice((17 * 130 + 17) * 4, (17 * 130 + 17) * 4 + 4)),
  ).toEqual([40, 60, 80, 255]);
  expect(Array.from(crop.data).filter((v) => v === 0)).toHaveLength(0);
});

async function fixture() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "OV-reader-test-"));
  const files = [];
  for (const file of ["server.exe", "model.gguf", "projector.gguf"]) {
    const bytes = Buffer.from(file);
    await fs.writeFile(path.join(folder, file), bytes);
    files.push({
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const manifest = {
    format: "open-volleyball-local-reader",
    version: 1,
    name: "Test reader",
    reader: "qwen3-vl",
    executable: "server.exe",
    model: "model.gguf",
    projector: "projector.gguf",
    files,
  };
  const save = () =>
    fs.writeFile(
      path.join(folder, "reader-pack.json"),
      JSON.stringify(manifest),
    );
  await save();
  return {
    folder,
    manifest,
    save,
    cleanup: () => fs.rm(folder, { recursive: true, force: true }),
  };
}

it("checks every native engine and model file before accepting a local pack", async () => {
  const f = await fixture();
  try {
    expect((await verifyReaderPack(f.folder)).name).toBe("Test reader");
    await fs.writeFile(path.join(f.folder, "model.gguf"), "wrong.gguf");
    await expect(verifyReaderPack(f.folder)).rejects.toThrow(/endommagé/);
  } finally {
    await f.cleanup();
  }
});
it("rejects path escapes, missing integrity entries and duplicate files", async () => {
  const f = await fixture();
  try {
    f.manifest.executable = "../server.exe";
    await f.save();
    await expect(verifyReaderPack(f.folder)).rejects.toThrow();
    f.manifest.executable = "unverified.exe";
    await f.save();
    await expect(verifyReaderPack(f.folder)).rejects.toThrow(/incomplet/);
    f.manifest.executable = "server.exe";
    f.manifest.files.push(f.manifest.files[0]);
    await f.save();
    await expect(verifyReaderPack(f.folder)).rejects.toThrow(/dupliqué/);
  } finally {
    await f.cleanup();
  }
});
function readyReader() {
  const reader = new RegistrationReader();
  Object.assign(reader, {
    ready: true,
    endpoint: "http://127.0.0.1:12345",
    key: "private-key",
    child: { kill: vi.fn() },
  });
  return reader;
}
const image = "data:image/png;base64,aGVsbG8=";
it("sends only inline crops to its authenticated loopback service", async () => {
  const reader = readyReader();
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "Élodie" } }],
      }),
    ),
  );
  try {
    expect(await reader.read(image, "text")).toBe("Élodie");
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:12345/v1/chat/completions");
    expect(options?.redirect).toBe("error");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer private-key",
    });
    const body = JSON.parse(options?.body as string);
    expect(body.messages[0].content[1].image_url.url).toBe(image);
    expect(body.messages).toHaveLength(1);
    expect(body.cache_prompt).toBe(false);
    await expect(
      reader.read("https://example.com/private.png", "text"),
    ).rejects.toThrow(/invalide/);
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
    reader.stop();
  }
});
it("rejects incomplete generations and results that arrive after cancellation", async () => {
  const reader = readyReader();
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "partial" } }],
      }),
    ),
  );
  try {
    await expect(reader.read(image, "email")).rejects.toThrow(/incomplète/);
    let resolve!: (response: Response) => void;
    request.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = reader.read(image, "email");
    await expect(reader.read(image, "email")).rejects.toThrow(/indisponible/);
    reader.stop();
    resolve(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "late" } }],
        }),
      ),
    );
    await expect(pending).rejects.toThrow(/interrompue/);
  } finally {
    request.mockRestore();
    reader.stop();
  }
});
