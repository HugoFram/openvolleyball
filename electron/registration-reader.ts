import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { z } from "zod";

const relative = z
  .string()
  .regex(/^[a-zA-Z0-9_./-]+$/)
  .refine((s) => !s.split("/").includes("..") && !s.startsWith("/"));
const manifestSchema = z.object({
  format: z.literal("open-volleyball-local-reader"),
  version: z.literal(1),
  name: z.string().min(1).max(100),
  reader: z.enum(["qwen3-vl", "qwen3.5"]),
  executable: relative,
  model: relative,
  projector: relative,
  imageMinTokens: z.union([z.literal(256), z.literal(1024)]).default(256),
  files: z
    .array(
      z.object({
        file: relative,
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(3)
    .max(100),
});
export type ReaderManifest = z.infer<typeof manifestSchema>;
export async function verifyReaderPack(
  folder: string,
): Promise<ReaderManifest> {
  const root = await fs.realpath(folder).catch(() => {
    throw Error(
      "Dossier du lecteur introuvable. Installez à nouveau le pack local.",
    );
  });
  const m = manifestSchema.parse(
    JSON.parse(await fs.readFile(path.join(root, "reader-pack.json"), "utf8")),
  );
  const seen = new Set<string>();
  for (const entry of m.files) {
    if (seen.has(entry.file)) throw Error("Fichier du lecteur dupliqué.");
    seen.add(entry.file);
    const file = await fs.realpath(path.join(root, entry.file));
    if (!file.startsWith(root + path.sep))
      throw Error("Fichier du lecteur hors du dossier choisi.");
    if ((await fs.stat(file)).size !== entry.bytes)
      throw Error("Fichier du lecteur incomplet : " + entry.file);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest("hex") !== entry.sha256)
      throw Error("Fichier du lecteur endommagé : " + entry.file);
  }
  if (![m.executable, m.model, m.projector].every((f) => seen.has(f)))
    throw Error("Lecteur local incomplet.");
  return m;
}
export const handwritingPrompt = (kind: "text" | "email") =>
  "Read this single handwritten " +
  (kind === "email" ? "email address" : "French name or short text") +
  ". Output ONLY its exact transcription. Preserve accents, spelling, punctuation and digits. Do not correct, translate, expand or explain. Ignore printed lines. If illegible, output ?. Do not invent missing characters.";

export class RegistrationReader {
  private child?: ChildProcess;
  private endpoint = "";
  private key = "";
  private generation = 0;
  private reading = false;
  private ready = false;
  private abort = new AbortController();
  stop() {
    this.abort.abort();
    this.abort = new AbortController();
    this.generation++;
    this.ready = false;
    this.reading = false;
    this.child?.kill();
    this.child = undefined;
    this.endpoint = "";
  }
  async start(folder: string, cpu = false) {
    this.stop();
    const generation = this.generation;
    const manifest = await verifyReaderPack(folder);
    if (this.generation !== generation) throw Error("Analyse interrompue.");
    const port = await new Promise<number>((resolve, reject) => {
      const socket = createServer();
      socket.once("error", reject);
      socket.listen(0, "127.0.0.1", () => {
        const address = socket.address();
        const port = typeof address === "object" && address ? address.port : 0;
        socket.close((error) => (error ? reject(error) : resolve(port)));
      });
    });
    if (this.generation !== generation) throw Error("Analyse interrompue.");
    this.key = randomBytes(32).toString("hex");
    this.endpoint = `http://127.0.0.1:${port}`;
    // No remote URLs, Hub identifiers, web interface, scan logs or inherited server settings.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/^(LLAMA_|HF_|HUGGING|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i.test(key),
      ),
    );
    const child = spawn(
      path.join(folder, manifest.executable),
      [
        "-m",
        path.join(folder, manifest.model),
        "--mmproj",
        path.join(folder, manifest.projector),
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--api-key",
        this.key,
        "--offline",
        "--no-webui",
        "--log-disable",
        "-c",
        "4096",
        "--parallel",
        "1",
        "-t",
        "6",
        "-ngl",
        cpu ? "0" : "99",
        "--image-min-tokens",
        String(manifest.imageMinTokens),
        "--image-max-tokens",
        "1024",
        "--no-context-shift",
        ...(cpu ? ["--device", "none", "--no-mmproj-offload"] : []),
      ],
      { cwd: folder, windowsHide: true, stdio: "ignore", env },
    );
    this.child = child;
    let failed = false;
    child.on("error", () => {
      failed = true;
    });
    child.on("exit", () => {
      failed = true;
      if (this.child === child) this.ready = false;
    });
    try {
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        if (this.generation !== generation) throw Error("Analyse interrompue.");
        if (failed)
          throw Error(
            "Démarrage du lecteur impossible. Essayez le mode processeur.",
          );
        try {
          const response = await fetch(this.endpoint + "/health", {
            signal: AbortSignal.timeout(1500),
            redirect: "error",
            headers: { Authorization: `Bearer ${this.key}` },
          });
          if (response.ok) {
            this.ready = true;
            return { name: manifest.name, cpu };
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw Error("Le lecteur local met trop de temps à démarrer.");
    } catch (error) {
      if (this.generation === generation) this.stop();
      throw error;
    }
  }
  async read(image: string, kind: "text" | "email") {
    if (!this.ready || !this.child || this.reading)
      throw Error("Lecteur avancé indisponible.");
    if (
      !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(image) ||
      image.length > 2000000
    )
      throw Error("Image du champ invalide.");
    const generation = this.generation;
    this.reading = true;
    try {
      const response = await fetch(this.endpoint + "/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(120000),
        ]),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.key}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: handwritingPrompt(kind) },
                { type: "image_url", image_url: { url: image } },
              ],
            },
          ],
          temperature: 0,
          seed: 42,
          max_tokens: 96,
          cache_prompt: false,
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
      if (!response.ok)
        throw Error("Le lecteur local n’a pas pu lire ce champ.");
      const result = await response.json();
      if (this.generation !== generation) throw Error("Analyse interrompue.");
      const choice = result.choices?.[0];
      if (
        choice?.finish_reason !== "stop" ||
        typeof choice.message?.content !== "string"
      )
        throw Error("Transcription incomplète : champ à recopier.");
      return choice.message.content.slice(0, 500);
    } finally {
      if (this.generation === generation) this.reading = false;
    }
  }
}
