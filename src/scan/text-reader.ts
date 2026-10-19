import {
  env,
  pipeline,
  RawImage,
  type ImageToTextPipeline,
} from "@huggingface/transformers";
import type { Raster } from "./geometry";

// These are packaged files. No CDN, Hub access, shared cache or model download.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL(
  "./assets/models/registration/",
  self.location.origin + "/",
).href;
env.useBrowserCache = false;
env.useFSCache = false;
env.useWasmCache = false;
env.backends.onnx.wasm!.wasmPaths = new URL(
  "./assets/ort/",
  self.location.origin + "/",
).href;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
let reader: Promise<ImageToTextPipeline> | undefined;
let config: Promise<{ taskPrefixes: boolean }> | undefined;
export async function transcribe(
  im: Raster,
  maxTokens = 64,
  kind: "text" | "email" = "text",
): Promise<string> {
  const settings = await (config ??= fetch(
    new URL(
      "./assets/models/registration/reader.json",
      self.location.origin + "/",
    ),
  ).then(async (r) => {
    if (!r.ok) throw Error("Configuration du lecteur local manquante");
    return r.json();
  }));
  const model = await (reader ??= pipeline(
    "image-to-text",
    "trocr-small-handwritten",
    { device: "wasm", dtype: "q8", local_files_only: true },
  ));
  const tag = kind === "email" ? "email:" : "text:";
  const result = await model(
    new RawImage(new Uint8ClampedArray(im.data), im.width, im.height, 4),
    {
      max_new_tokens: maxTokens,
      num_beams: 1,
      do_sample: false,
      ...(settings.taskPrefixes
        ? {
            decoder_input_ids: [
              2,
              0,
              ...model.tokenizer.encode(tag, { add_special_tokens: false }),
            ],
          }
        : {}),
    },
  );
  const text = result[0]?.generated_text || "";
  if (settings.taskPrefixes && !text.startsWith(tag))
    throw Error("Réponse du lecteur local incomplète");
  return settings.taskPrefixes ? text.slice(tag.length) : text;
}
