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
export async function transcribe(im: Raster, maxTokens = 64): Promise<string> {
  const model = await (reader ??= pipeline(
    "image-to-text",
    "trocr-small-handwritten",
    { device: "wasm", dtype: "q8", local_files_only: true },
  ));
  const result = await model(
    new RawImage(new Uint8ClampedArray(im.data), im.width, im.height, 4),
    { max_new_tokens: maxTokens, num_beams: 1, do_sample: false },
  );
  return result[0]?.generated_text || "";
}
